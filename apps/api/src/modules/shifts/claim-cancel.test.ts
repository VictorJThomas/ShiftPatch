// POST /api/shifts/:id/claim and /cancel against a real throwaway Postgres: no mocked repository or database anywhere.
import { CancelShiftResponse, ClaimShiftResponse, ErrorMessage } from "@shiftpatch/contracts";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import {
  agencies, agencyMemberships, auditLog, credentials, hospitalNetworks, networkAgencies, notifications, nurseProfiles, shiftCancellations, shifts, userProfiles, users,
} from "../../db/schema/index.js";
import { seed } from "../../db/seed.js";
import { createTestDb } from "../../db/test-db.js";
import { signAccessToken } from "../auth/tokens.js";

let t: Awaited<ReturnType<typeof createTestDb>>;
const apps: FastifyInstance[] = [];
type Role = "agency" | "nurse" | "admin";
const roles = new Map<string, Role>([["agency-a", "agency"], ["agency-b", "agency"], ["nurse-1", "nurse"], ["nurse-2", "nurse"], ["admin-1", "admin"]]);

const FUTURE = "2099-02-01";
const NURSES_20 = Array.from({ length: 20 }, (_, i) => `cn${String(i + 1).padStart(2, "0")}`);

async function makeUser(id: string, role: Role) {
  await t.db.insert(users).values({ id, email: `${id}@example.com`, role, passwordHash: "x" });
  await t.db.insert(userProfiles).values({ userId: id, fullName: id });
  roles.set(id, role);
}
async function makeNurse(id: string, opts: { expiresOn?: string | null; status?: "pending" | "verified" | "rejected"; networkId?: string } = {}) {
  await makeUser(id, "nurse");
  await t.db.insert(nurseProfiles).values({ userId: id, networkId: opts.networkId ?? "network-default" });
  if (opts.expiresOn === null) return; // no license at all
  const status = opts.status ?? "verified";
  await t.db.insert(credentials).values({
    id: `cred-${id}`, nurseId: id, type: "license", expiresOn: opts.expiresOn ?? "2099-12-31", status,
    ...(status === "pending" ? {} : { reviewedBy: "admin-1", reviewedAt: new Date("2026-01-01T00:00:00Z") }),
  });
}
const member = (userId: string, agencyId: string, role: "owner" | "manager" | "viewer") =>
  t.db.insert(agencyMemberships).values({ id: `agm_${userId}_${agencyId}`, userId, agencyId, role });

let seq = 0;
/** A fresh open (or filled) shift, so no test depends on another's state. */
async function mkShift(over: { id?: string; agencyId?: string; networkId?: string; status?: "open" | "filled"; claimedBy?: string; deleted?: boolean } = {}) {
  const id = over.id ?? `shift-${8000 + ++seq}`;
  const filled = over.status === "filled";
  await t.db.insert(shifts).values({
    id, networkId: over.networkId ?? "network-default", agencyId: over.agencyId ?? "agency-a", role: "RN", shiftDate: FUTURE, startTime: "07:00", endTime: "19:00",
    timezone: "America/New_York", status: over.status ?? "open", createdBy: "admin-1",
    ...(filled ? { claimedBy: over.claimedBy ?? "cn01", claimedAt: new Date() } : {}),
    ...(over.deleted ? { deletedAt: new Date() } : {}),
  });
  return id;
}

beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db);
  process.env.DATABASE_URL = t.url;
  await t.db.insert(hospitalNetworks).values({ id: "network-2", name: "Second Network" });
  await t.db.insert(agencies).values({ id: "agency-c", name: "Gulf Staffing" });
  await t.db.insert(networkAgencies).values({ networkId: "network-2", agencyId: "agency-c" });
  await makeUser("mgr-a", "agency"); await member("mgr-a", "agency-a", "manager");
  await makeUser("viewer-a", "agency"); await member("viewer-a", "agency-a", "viewer");
  await makeUser("owner-c", "agency"); await member("owner-c", "agency-c", "owner");
  for (const id of NURSES_20) await makeNurse(id);
  await makeNurse("n-exp", { expiresOn: "2020-01-01" });
  await makeNurse("n-none", { expiresOn: null });
  await makeNurse("n-rej", { status: "rejected" });
  await makeNurse("n-pend", { status: "pending" });
  await makeNurse("n-net2", { networkId: "network-2" });
});
afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()));
  await t?.drop();
});

/** Every call gets its OWN app = its own Postgres pool, so concurrent requests really use independent connections. */
let ip = 0;
async function call(url: string, who?: string, body?: unknown, app?: FastifyInstance) {
  const a = app ?? (await newApp());
  const headers: Record<string, string> = {};
  if (who) headers.authorization = `Bearer ${await signAccessToken({ id: who, role: roles.get(who)! })}`;
  const res = await a.inject({
    method: "POST", url, headers, remoteAddress: `10.2.${Math.floor(++ip / 250)}.${ip % 250}`, ...(body === undefined ? {} : { payload: body as object }),
  });
  return { status: res.statusCode, body: res.json() as Record<string, unknown> };
}
async function newApp() {
  const a = buildApp();
  await a.ready();
  apps.push(a);
  return a;
}
const claim = (id: string, who?: string, app?: FastifyInstance) => call(`/api/shifts/${id}/claim`, who, undefined, app);
const cancel = (id: string, who: string | undefined, reason: unknown, app?: FastifyInstance) => call(`/api/shifts/${id}/cancel`, who, { reason }, app);
const shiftRow = async (id: string) => (await t.db.select().from(shifts).where(eq(shifts.id, id)))[0]!;
const audits = (id: string, action: string) => t.db.select().from(auditLog).where(and(eq(auditLog.entityId, id), eq(auditLog.action, action)));
const cancellations = (id: string) => t.db.select().from(shiftCancellations).where(eq(shiftCancellations.shiftId, id));
const outbox = async (id: string) => (await t.db.select().from(notifications).where(sql`${notifications.payload}->>'shiftId' = ${id}`)).map((n) => n.recipientEmail).sort();
const err = (r: { status: number; body: unknown }, status: number, error: string) => expect(r).toMatchObject({ status, body: { error } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("claim: concurrency (genuine Postgres, independent connections)", () => {
  it("20 concurrent claims on one open shift: exactly one 200, nineteen 409, one nurse, one audit row", async () => {
    const id = await mkShift();
    const before = await t.db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(eq(auditLog.action, "shift.claimed"));
    const results = await Promise.all(NURSES_20.map(async (n) => ({ n, ...(await claim(id, n)) })));

    const ok = results.filter((r) => r.status === 200);
    expect(ok).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(19);
    for (const r of results.filter((x) => x.status === 409)) expect(r.body).toEqual({ error: ErrorMessage.shiftNotOpen });
    const winner = ok[0]!;
    expect(ClaimShiftResponse.parse(winner.body)).toMatchObject({ id, status: "filled", claimedBy: winner.n });

    const row = await shiftRow(id);
    expect(row).toMatchObject({ status: "filled", claimedBy: winner.n });
    expect(row.claimedAt).not.toBeNull();
    // no duplicated assignment: among these 20 nurses only the winner holds this shift, and nobody else holds any shift from this test
    const held = await t.db.select({ id: shifts.id, by: shifts.claimedBy }).from(shifts).where(sql`${shifts.claimedBy} like 'cn%' and ${shifts.id} = ${id}`);
    expect(held).toEqual([{ id, by: winner.n }]);
    const log = await audits(id, "shift.claimed");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actorUserId: winner.n, actorRole: "nurse", agencyId: "agency-a", networkId: "network-default" });
    expect(log[0]!.requestId).toBeTruthy();
    const after = await t.db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(eq(auditLog.action, "shift.claimed"));
    expect(after[0]!.n - before[0]!.n).toBe(1); // 19 losers wrote nothing
    expect(await outbox(id)).toEqual([]);
  });

  it("the same nurse claiming twice at once: one 200, one 409, one audit row", async () => {
    const id = await mkShift();
    const r = await Promise.all([claim(id, "cn01"), claim(id, "cn01")]);
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(await audits(id, "shift.claimed")).toHaveLength(1);
    expect((await shiftRow(id)).claimedBy).toBe("cn01");
  });

  it("two different nurses at once: one 200, one 409, the winner holds the shift", async () => {
    const id = await mkShift();
    const [a, b] = await Promise.all([claim(id, "cn02"), claim(id, "cn03")]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await shiftRow(id)).claimedBy).toBe(a.status === 200 ? "cn02" : "cn03");
    expect(await audits(id, "shift.claimed")).toHaveLength(1);
  });
});

describe("claim: rules", () => {
  it("already filled -> 409", async () => {
    const id = await mkShift({ status: "filled", claimedBy: "cn01" });
    err(await claim(id, "cn02"), 409, ErrorMessage.shiftNotOpen);
    expect((await shiftRow(id)).claimedBy).toBe("cn01");
    expect(await audits(id, "shift.claimed")).toHaveLength(0);
  });

  it("soft-deleted and unknown shifts -> 404 (also a malformed id)", async () => {
    err(await claim(await mkShift({ deleted: true }), "cn02"), 404, ErrorMessage.shiftNotFound);
    err(await claim("shift-99999", "cn02"), 404, ErrorMessage.shiftNotFound);
    err(await claim("a%20b", "cn02"), 404, ErrorMessage.shiftNotFound);
  });

  it("401 without a token; agency and admin 403; a nurse of another network 404", async () => {
    const id = await mkShift();
    err(await claim(id), 401, ErrorMessage.unauthorized);
    err(await claim(id, "agency-a"), 403, ErrorMessage.forbidden);
    err(await claim(id, "admin-1"), 403, ErrorMessage.forbidden);
    err(await claim(id, "n-net2"), 404, ErrorMessage.shiftNotFound);
    expect((await shiftRow(id)).status).toBe("open");
  });

  it("expired license -> the exact spec 403; nothing written", async () => {
    const id = await mkShift();
    err(await claim(id, "n-exp"), 403, "Credential expired, cannot claim shift");
    err(await claim(id, "nurse-2"), 403, "Credential expired, cannot claim shift"); // the seeded expired nurse
    const row = await shiftRow(id);
    expect(row).toMatchObject({ status: "open", claimedBy: null, claimedAt: null });
    expect(await audits(id, "shift.claimed")).toHaveLength(0);
  });

  it("no license or only rejected -> the exact 'No valid credential' 403", async () => {
    const id = await mkShift();
    err(await claim(id, "n-none"), 403, "No valid credential on file, cannot claim shift");
    err(await claim(id, "n-rej"), 403, "No valid credential on file, cannot claim shift");
    expect((await shiftRow(id)).status).toBe("open");
  });

  it("a license that lapses before the shift day (valid today) is refused", async () => {
    await t.db.update(credentials).set({ expiresOn: "2098-12-31" }).where(eq(credentials.id, "cred-cn04"));
    err(await claim(await mkShift(), "cn04"), 403, ErrorMessage.credentialExpired);
    await t.db.update(credentials).set({ expiresOn: "2099-12-31" }).where(eq(credentials.id, "cred-cn04"));
  });

  it("a pending, unexpired license is allowed (MVP)", async () => {
    const id = await mkShift();
    const r = await claim(id, "n-pend");
    expect(r.status).toBe(200);
    expect(ClaimShiftResponse.parse(r.body).claimedBy).toBe("n-pend");
  });

  it("seed shift-1 + nurse-1: exact spec shape", async () => {
    const r = await claim("shift-1", "nurse-1");
    expect(ClaimShiftResponse.parse(r.body)).toEqual({
      id: "shift-1", agencyId: "agency-a", agencyName: "Sunrise Health Staffing", role: "RN", date: "2026-10-02", startTime: "19:00", endTime: "07:00", status: "filled", claimedBy: "nurse-1",
    });
  });
});

describe("claim: credential change racing the claim", () => {
  it("a license UPDATE in flight blocks the claim (FOR SHARE) and the claim sees the committed result", async () => {
    const id = await mkShift();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let updated!: () => void;
    const updatedP = new Promise<void>((r) => (updated = r));
    // an "admin" transaction expires cn05's license and holds its row lock
    const held = t.sql.begin(async (q) => {
      await q`update credentials set expires_on = '2020-01-01' where id = 'cred-cn05'`;
      updated();
      await gate;
    });
    await updatedP;

    let done = false;
    const claiming = claim(id, "cn05").then((r) => ((done = true), r));
    await sleep(400);
    expect(done).toBe(false); // blocked on the credential row lock: without FOR SHARE it would already have claimed on the stale license
    release();
    await held;
    err(await claiming, 403, ErrorMessage.credentialExpired);
    expect(await shiftRow(id)).toMatchObject({ status: "open", claimedBy: null });
    await t.db.update(credentials).set({ expiresOn: "2099-12-31" }).where(eq(credentials.id, "cred-cn05"));
  });

  it("a claim that commits first is not undone by a later license change", async () => {
    const id = await mkShift();
    expect((await claim(id, "cn06")).status).toBe(200);
    await t.db.update(credentials).set({ expiresOn: "2020-01-01" }).where(eq(credentials.id, "cred-cn06"));
    expect((await shiftRow(id)).claimedBy).toBe("cn06"); // §5.3: no automatic unassign
    await t.db.update(credentials).set({ expiresOn: "2099-12-31" }).where(eq(credentials.id, "cred-cn06"));
  });
});

describe("cancel", () => {
  it("the claiming nurse can cancel with advance: shift reopened, history, audit, outbox", async () => {
    const id = await mkShift({ status: "filled", claimedBy: "cn07" });
    const r = await cancel(id, "cn07", "advance");
    expect(r.status).toBe(200);
    expect(CancelShiftResponse.parse(r.body)).toMatchObject({ id, status: "open", claimedBy: null, cancellation: { reason: "advance", previousNurseId: "cn07" } });
    expect(await shiftRow(id)).toMatchObject({ status: "open", claimedBy: null, claimedAt: null });
    const [c, ...rest] = await cancellations(id);
    expect(rest).toHaveLength(0);
    expect(c).toMatchObject({ reason: "advance", previousNurseId: "cn07", cancelledBy: "cn07", cancelledByRole: "nurse" });
    const log = await audits(id, "shift.cancelled");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actorUserId: "cn07", changes: { status: ["filled", "open"], claimedBy: ["cn07", null], reason: "advance" } });
    // nurse cancels -> owners/managers of the agency only (agency-a owner + mgr-a); never the viewer, never the nurse
    expect(await outbox(id)).toEqual(["admin@sunrisehealth.example", "mgr-a@example.com"]);
  });

  it("the nurse can claim the reopened shift again", async () => {
    const id = await mkShift({ status: "filled", claimedBy: "cn08" });
    expect((await cancel(id, "cn08", "advance")).status).toBe(200);
    expect((await claim(id, "cn09")).status).toBe(200);
  });

  it("agency manager cancels with no-show: previous nurse + the other owners/managers are emailed (not the actor, not the viewer)", async () => {
    const id = await mkShift({ status: "filled", claimedBy: "cn10" });
    const r = await cancel(id, "mgr-a", "no-show");
    expect(CancelShiftResponse.parse(r.body).cancellation).toEqual({ reason: "no-show", previousNurseId: "cn10" });
    expect(await outbox(id)).toEqual(["admin@sunrisehealth.example", "cn10@example.com"]);
    expect((await cancellations(id))[0]).toMatchObject({ cancelledBy: "mgr-a", cancelledByRole: "agency" });
    const payload = (await t.db.select().from(notifications).where(sql`${notifications.payload}->>'shiftId' = ${id}`))[0]!;
    expect(payload).toMatchObject({ template: "shift.cancelled", status: "pending" });
    expect(Object.keys(payload.payload as object).sort()).toEqual(["agencyName", "date", "endTime", "reason", "role", "shiftId", "startTime"]); // no credential data
  });

  it("the network admin can cancel; the contract-seed shift-2 round trip is exact", async () => {
    const r = await cancel("shift-2", "admin-1", "no-show");
    expect(CancelShiftResponse.parse(r.body)).toEqual({
      id: "shift-2", agencyId: "agency-a", agencyName: "Sunrise Health Staffing", role: "LPN", date: "2026-10-03", startTime: "07:00", endTime: "19:00",
      status: "open", claimedBy: null, cancellation: { reason: "no-show", previousNurseId: "nurse-1" },
    });
  });

  it("who may not cancel -> 403 and nothing changes", async () => {
    const id = await mkShift({ status: "filled", claimedBy: "cn11" });
    err(await cancel(id, "cn11", "no-show"), 403, ErrorMessage.forbidden); // nurse: advance only
    err(await cancel(id, "cn12", "advance"), 403, ErrorMessage.forbidden); // a nurse who does not hold it
    err(await cancel(id, "viewer-a", "advance"), 403, ErrorMessage.forbidden);
    err(await cancel(id, "agency-b", "advance"), 403, ErrorMessage.forbidden); // another agency
    err(await cancel(id, "owner-c", "advance"), 403, ErrorMessage.forbidden); // another network's agency
    err(await cancel(id, "n-net2", "advance"), 403, ErrorMessage.forbidden); // another network's nurse
    expect(await shiftRow(id)).toMatchObject({ status: "filled", claimedBy: "cn11" });
    expect(await cancellations(id)).toHaveLength(0);
    expect(await audits(id, "shift.cancelled")).toHaveLength(0);
    expect(await outbox(id)).toEqual([]);
  });

  it("401, 400 (bad reason), 404, and 409 for a shift that is not filled", async () => {
    const filled = await mkShift({ status: "filled", claimedBy: "cn13" });
    err(await cancel(filled, undefined, "advance"), 401, ErrorMessage.unauthorized);
    const bad = await cancel(filled, "agency-a", "sick");
    expect(bad.status).toBe(400);
    expect(typeof bad.body.error).toBe("string");
    expect((await call(`/api/shifts/${filled}/cancel`, "agency-a")).status).toBe(400); // no body / no reason
    err(await cancel("shift-99999", "agency-a", "advance"), 404, ErrorMessage.shiftNotFound);
    err(await cancel(await mkShift({ deleted: true, status: "open" }), "agency-a", "advance"), 404, ErrorMessage.shiftNotFound);
    err(await cancel(await mkShift(), "agency-a", "advance"), 409, ErrorMessage.shiftNotFilled); // open shift: that is withdrawal, not cancel
    expect((await shiftRow(filled)).status).toBe("filled");
  });
});

describe("cancel: races", () => {
  it("two concurrent cancels: one 200, one 409, a single history row, audit row and set of emails", async () => {
    const id = await mkShift({ status: "filled", claimedBy: "cn14" });
    const r = await Promise.all([cancel(id, "mgr-a", "no-show"), cancel(id, "admin-1", "no-show"), cancel(id, "agency-a", "advance")]);
    expect(r.map((x) => x.status).sort()).toEqual([200, 409, 409]);
    expect(await cancellations(id)).toHaveLength(1);
    expect(await audits(id, "shift.cancelled")).toHaveLength(1);
    expect(await shiftRow(id)).toMatchObject({ status: "open", claimedBy: null });
    const winner = (await cancellations(id))[0]!;
    const owner = "admin@sunrisehealth.example";
    const expected = { "mgr-a": [owner, "cn14@example.com"], "admin-1": [owner, "cn14@example.com", "mgr-a@example.com"], "agency-a": ["cn14@example.com", "mgr-a@example.com"] }[winner.cancelledBy]!;
    expect(await outbox(id)).toEqual([...expected].sort()); // exact recipients per actor, actor excluded
  });

  it("cancel racing a claim by someone else: cancel always wins its 200; end state matches the claim's outcome", async () => {
    for (let i = 0; i < 5; i++) {
      const id = await mkShift({ status: "filled", claimedBy: "cn15" });
      const [c, k] = await Promise.all([cancel(id, "agency-a", "no-show"), claim(id, "cn16")]);
      expect(c.status).toBe(200);
      expect([200, 409]).toContain(k.status);
      const row = await shiftRow(id);
      if (k.status === 200) expect(row).toMatchObject({ status: "filled", claimedBy: "cn16" }); // cancel committed, then the claim got in
      else expect(row).toMatchObject({ status: "open", claimedBy: null }); // the claim hit a still-filled shift
      expect(await cancellations(id)).toHaveLength(1);
      expect(await audits(id, "shift.claimed")).toHaveLength(k.status === 200 ? 1 : 0);
    }
  });
});

describe("rollback: a failure late in the transaction undoes everything", () => {
  const trap = async (table: string, fn: string, entity: string) => {
    await t.sql.unsafe(`create or replace function ${fn}() returns trigger language plpgsql as $$ begin raise exception 'forced failure'; end $$`);
    await t.sql.unsafe(`create trigger ${fn} before insert on ${table} for each row when (${entity}) execute function ${fn}()`);
    return () => t.sql.unsafe(`drop trigger ${fn} on ${table}`);
  };

  it("claim: audit insert fails -> 500, shift still open, nobody assigned", async () => {
    const id = await mkShift({ id: "shift-rb1" });
    const untrap = await trap("audit_log", "fail_audit_rb1", `new.entity_id = 'shift-rb1'`);
    try {
      const failed = await claim(id, "cn17");
      expect(failed).toMatchObject({ status: 500, body: { error: "Internal server error" } });
      expect(await shiftRow(id)).toMatchObject({ status: "open", claimedBy: null, claimedAt: null });
    } finally {
      await untrap();
    }
    expect((await claim(id, "cn17")).status).toBe(200); // and the shift is claimable once the fault is gone
  });

  it("cancel: outbox insert fails -> 500, still filled, no history, no audit", async () => {
    const id = await mkShift({ id: "shift-rb2", status: "filled", claimedBy: "cn18" });
    const untrap = await trap("notifications", "fail_outbox_rb2", `new.payload->>'shiftId' = 'shift-rb2'`);
    try {
      expect(await cancel(id, "agency-a", "no-show")).toMatchObject({ status: 500, body: { error: "Internal server error" } });
      expect(await shiftRow(id)).toMatchObject({ status: "filled", claimedBy: "cn18" });
      expect(await cancellations(id)).toHaveLength(0);
      expect(await audits(id, "shift.cancelled")).toHaveLength(0);
    } finally {
      await untrap();
    }
    expect((await cancel(id, "agency-a", "no-show")).status).toBe(200);
  });
});
