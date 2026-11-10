import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { networkDefaultTimezone } from "../shifts/repository.js";
import { todayIn } from "../shifts/eligibility.js";
import { enqueue } from "./enqueue.js";
import { agencyManagers, networkAdmins, type Recipient, userRecipient } from "./recipients.js";

// Reminder sweep (ARCHITECTURE §10): time-based emails S1-S5, written to the same outbox as the event mails. A periodic tick looks
// for due conditions and inserts rows with a `dedupe_key`; the partial unique index makes every insert idempotent, so repeated
// ticks, restarts and several replicas never send twice. The advisory lock only saves wasted work across replicas.

export const SWEEP_LOCK_KEY = 728_431_005; // arbitrary constant for pg_try_advisory_xact_lock
export const SWEEP_INTERVAL_MS = 900_000; // 15 min
const BATCH = 500;
const DAY_MS = 86_400_000;

/** ISO date + n days, computed on UTC noon so DST never shifts the day. */
export const addDays = (isoDate: string, n: number): string => new Date(Date.parse(`${isoDate}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

type CredRow = { id: string; nurse_id: string; type: string; expires_on: string; network_id: string; email: string; full_name: string };
type ShiftRow = { id: string; agency_id: string; claimed_by: string | null; role: string; shift_date: string; start_time: string; end_time: string; agency_name: string };

export function createReminderSweep(o: { db: Db; intervalMs?: number; now?: () => Date; onError?: (e: unknown) => void }) {
  const { db } = o;
  const now = o.now ?? (() => new Date());
  const onError = o.onError ?? ((e) => console.error("reminder sweep:", e instanceof Error ? e.message : String(e)));

  async function tick(): Promise<{ inserted: number; skipped: boolean }> {
    const at = now();
    return db.transaction(async (tx) => {
      const [lock] = await tx.execute<{ got: boolean }>(sql`select pg_try_advisory_xact_lock(${SWEEP_LOCK_KEY}) as got`);
      if (!lock?.got) return { inserted: 0, skipped: true };
      let inserted = 0;
      const atIso = at.toISOString();

      // Per-tick caches: one lookup per network / agency instead of one per row.
      const tz = new Map<string, string>(), admins = new Map<string, Recipient[]>(), managers = new Map<string, Recipient[]>();
      const todayOf = async (networkId: string) => {
        if (!tz.has(networkId)) tz.set(networkId, todayIn(await networkDefaultTimezone(tx, networkId), at));
        return tz.get(networkId)!;
      };
      const adminsOf = async (networkId: string) => admins.get(networkId) ?? admins.set(networkId, await networkAdmins(tx, networkId)).get(networkId)!;
      const managersOf = async (agencyId: string) => managers.get(agencyId) ?? managers.set(agencyId, await agencyManagers(tx, agencyId)).get(agencyId)!;

      // S1 / S2 / S3. "Current" credential = no newer non-deleted, non-rejected one of the same type for that nurse. Newest expiry
      // first. Expired more than 30 d ago = no longer mailed (and not re-scanned every tick).
      const creds = await tx.execute<CredRow>(sql`
        select c.id, c.nurse_id, c.type, c.expires_on::text as expires_on, np.network_id, u.email, up.full_name
        from credentials c
        join nurse_profiles np on np.user_id = c.nurse_id
        join users u on u.id = c.nurse_id and u.status = 'active' and u.deleted_at is null
        join user_profiles up on up.user_id = u.id
        where c.deleted_at is null and c.status <> 'rejected' and c.expires_on is not null
          and c.expires_on <= (${atIso}::timestamptz + interval '31 days')::date
          and c.expires_on >= (${atIso}::timestamptz - interval '30 days')::date
          and not exists (select 1 from credentials c2 where c2.nurse_id = c.nurse_id and c2.type = c.type and c2.deleted_at is null
                          and c2.status <> 'rejected' and c2.created_at > c.created_at)
        order by c.expires_on desc limit ${BATCH}`);
      for (const c of creds) {
        const today = await todayOf(c.network_id);
        const nurse: Recipient = { userId: c.nurse_id, email: c.email };
        if (c.expires_on < today) {
          inserted += await enqueue(tx, { template: "credential.expired", payload: { audience: "nurse", expiresOn: c.expires_on }, recipients: [nurse], dedupeKey: (r) => `cred-expired:${c.id}:${r.userId}` });
          inserted += await enqueue(tx, { template: "credential.expired", payload: { audience: "admin", nurseName: c.full_name }, recipients: await adminsOf(c.network_id), dedupeKey: (r) => `cred-expired:${c.id}:${r.userId}` });
          continue;
        }
        // The 7 d window does not suppress 30 d: a credential uploaded 5 days before expiry gets both, once each.
        for (const [days, label] of [[30, "30d"], [7, "7d"]] as const) {
          if (c.expires_on <= addDays(today, days)) {
            inserted += await enqueue(tx, { template: "credential.expiring", payload: { expiresOn: c.expires_on }, recipients: [nurse], dedupeKey: () => `cred-exp:${c.id}:${label}` });
          }
        }
        if (c.type === "license") {
          const lapsing = await tx.execute<ShiftRow>(sql`
            select s.id, s.agency_id, s.role, s.shift_date::text as shift_date, left(s.start_time::text, 5) as start_time, left(s.end_time::text, 5) as end_time
            from shifts s
            where s.claimed_by = ${c.nurse_id} and s.status = 'filled' and s.deleted_at is null
              and s.shift_date > ${c.expires_on}::date and s.shift_date >= ${today}::date and s.shift_date <= ${addDays(today, 30)}::date
            limit ${BATCH}`);
          for (const s of lapsing) {
            inserted += await enqueue(tx, {
              template: "shift.nurse_license_lapses",
              payload: { shiftId: s.id, role: s.role, date: s.shift_date, startTime: s.start_time, endTime: s.end_time, nurseName: c.full_name },
              recipients: await managersOf(s.agency_id),
              dedupeKey: (r) => `lapse:${s.id}:${c.id}:${r.userId}`,
            });
          }
        }
      }

      // S4 / S5: shifts whose facility-local start is within the next 24 h.
      const soon = await tx.execute<ShiftRow>(sql`
        select s.id, s.agency_id, s.claimed_by, s.role, s.shift_date::text as shift_date, left(s.start_time::text, 5) as start_time,
               left(s.end_time::text, 5) as end_time, a.name as agency_name
        from shifts s join agencies a on a.id = s.agency_id
        where s.deleted_at is null and s.status in ('filled', 'open')
          and ((s.shift_date + s.start_time) at time zone s.timezone) > ${atIso}::timestamptz
          and ((s.shift_date + s.start_time) at time zone s.timezone) <= ${atIso}::timestamptz + interval '24 hours'
        order by s.shift_date, s.start_time limit ${BATCH}`);
      for (const s of soon) {
        const payload = { shiftId: s.id, role: s.role, date: s.shift_date, startTime: s.start_time, endTime: s.end_time, agencyName: s.agency_name };
        if (s.claimed_by) {
          inserted += await enqueue(tx, { template: "shift.reminder", payload, recipients: [await userRecipient(tx, s.claimed_by)], dedupeKey: (r) => `remind:${s.id}:${r.userId}` });
        } else {
          inserted += await enqueue(tx, { template: "shift.unfilled", payload, recipients: await managersOf(s.agency_id), dedupeKey: (r) => `unfilled:${s.id}:${r.userId}` });
        }
      }
      return { inserted, skipped: false };
    });
  }

  let timer: ReturnType<typeof setInterval> | undefined;
  let inflight: Promise<unknown> = Promise.resolve();
  let running = false;

  return {
    tick,
    start() {
      if (timer) return;
      timer = setInterval(() => {
        if (running) return; // never overlap ticks in one process
        running = true;
        inflight = tick().catch(onError).finally(() => { running = false; });
      }, o.intervalMs ?? SWEEP_INTERVAL_MS);
      timer.unref();
    },
    /** Stops scheduling and waits for the tick in flight, so closing the DB afterwards is safe. */
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      await inflight;
    },
  };
}

export type ReminderSweep = ReturnType<typeof createReminderSweep>;
