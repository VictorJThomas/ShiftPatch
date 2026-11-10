import { and, asc, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { notifications } from "../../db/schema/index.js";
import type { MailSender } from "./mail.js";
import { PermanentMailError, renderTemplate } from "./templates.js";

// Transactional-outbox dispatcher (ARCHITECTURE §10). Rows are written by the business transaction; this only drains them.
// Delivery is at-least-once. Claim = one atomic UPDATE (pending -> sending + lease, attempts+1, FOR UPDATE SKIP LOCKED), so
// concurrent dispatchers never claim the same row. Sends run outside any transaction. A crash or failed outcome write leaves the
// row `sending`; after the lease it is reclaimed (a mail may go out twice, never zero times) and attempts bound the retries.

export const MAX_ATTEMPTS = 5;
export const BATCH_SIZE = 20;
export const BACKOFF_BASE_MS = 30_000;
export const LEASE_MS = 300_000;
const MAX_ERROR_LEN = 500;

/** Delay before the next try after the `attempts`-th failure (1-based): 30 s, 60 s, 120 s, 240 s. */
export const backoffMs = (attempts: number, base = BACKOFF_BASE_MS) => base * 2 ** (attempts - 1);

const describe = (err: unknown) => (err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").slice(0, MAX_ERROR_LEN);

export interface DispatcherOptions {
  db: Db;
  sender: MailSender;
  intervalMs?: number;
  batchSize?: number;
  backoffBaseMs?: number;
  /** How long a claim holds a row before it can be reclaimed. Must exceed batchSize x send timeout (10 s). Default 5 min. */
  leaseMs?: number;
  /** Plain app URL for the mail footer (APP_ORIGIN). Never tokenized. */
  appUrl?: string | undefined;
  now?: () => Date;
  onError?: (err: unknown) => void;
}

export function createDispatcher(opts: DispatcherOptions) {
  const { db, sender } = opts;
  const batchSize = opts.batchSize ?? BATCH_SIZE;
  const base = opts.backoffBaseMs ?? BACKOFF_BASE_MS;
  const leaseMs = opts.leaseMs ?? LEASE_MS;
  const now = opts.now ?? (() => new Date());
  const onError = opts.onError ?? ((err) => console.error("outbox dispatcher:", describe(err)));

    /**
   * Claim: one short atomic UPDATE (no transaction held open during sends). Due `pending` rows, plus `sending` rows whose lease
   * expired (the claimer crashed or its outcome write failed) while attempts remain. Each claim counts as an attempt, so a
   * crash or a lost outcome write can never loop forever.
   */
  async function claim(at: Date) {
    // Expired lease with no attempts left: that last attempt was never confirmed -> failed (no further send).
    await db.update(notifications)
      .set({ status: "failed", lastError: "lease expired after final attempt", updatedAt: at })
      .where(and(eq(notifications.status, "sending"), lte(notifications.lockedUntil, at), gte(notifications.attempts, MAX_ATTEMPTS)));
    const candidates = db.select({ id: notifications.id }).from(notifications)
      .where(or(
        and(eq(notifications.status, "pending"), lte(notifications.nextAttemptAt, at)),
        and(eq(notifications.status, "sending"), lte(notifications.lockedUntil, at), lt(notifications.attempts, MAX_ATTEMPTS)),
      ))
      .orderBy(asc(notifications.nextAttemptAt)).limit(batchSize)
      .for("update", { skipLocked: true });
    return db.update(notifications)
      .set({ status: "sending", lockedUntil: new Date(at.getTime() + leaseMs), attempts: sql`${notifications.attempts} + 1`, updatedAt: at })
      .where(inArray(notifications.id, candidates))
      .returning();
  }

  /** One pass: claim a batch, send each row outside any transaction, write each outcome in its own statement. Returns rows handled. */
  async function tick(): Promise<number> {
    const at = now();
    const rows = await claim(at);
    for (const row of rows) {
      let outcome: Partial<typeof notifications.$inferInsert>;
      try {
        await sender.send({ to: row.recipientEmail, ...renderTemplate(row.template, row.payload, { appUrl: opts.appUrl }) });
        outcome = { status: "sent", sentAt: at, lastError: null, lockedUntil: null };
      } catch (err) {
        const failed = err instanceof PermanentMailError || row.attempts >= MAX_ATTEMPTS;
        outcome = {
          status: failed ? "failed" : "pending", lastError: describe(err), lockedUntil: null,
          ...(failed ? {} : { nextAttemptAt: new Date(at.getTime() + backoffMs(row.attempts, base)) }),
        };
      }
      try {
        // Guarded by the claim's attempt number: if our lease expired and another dispatcher re-claimed the row, don't overwrite.
        await db.update(notifications).set({ ...outcome, updatedAt: at })
          .where(and(eq(notifications.id, row.id), eq(notifications.status, "sending"), eq(notifications.attempts, row.attempts)));
      } catch (err) {
        onError(err); // row stays `sending`; the lease expires and it is reclaimed (bounded by MAX_ATTEMPTS)
      }
    }
    return rows.length;
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
      }, opts.intervalMs ?? 10_000);
      timer.unref(); // the timer alone must not keep the process alive
    },
    /** Stops scheduling and waits for the tick in flight, so closing the DB afterwards is safe. */
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      await inflight;
    },
  };
}

export type Dispatcher = ReturnType<typeof createDispatcher>;
