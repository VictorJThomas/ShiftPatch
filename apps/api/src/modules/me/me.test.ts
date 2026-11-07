// GET /api/me, POST /api/shifts/:id/withdraw, GET /api/nurses/me/shifts and the empty-JSON-body tolerance, against a real throwaway Postgres.
import { ErrorMessage, MeResponse, NurseShiftsResponse, WithdrawShiftResponse } from "@shiftpatch/contracts";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { agencies, agencyMemberships, auditLog, credentials, notifications, nurseProfiles, shifts, userProfiles, users } from "../../db/schema/index.js";
import { seed } from "../../db/seed.js";
import { createTestDb } from "../../db/test-db.js";
import { signAccessToken } from "../auth/tokens.js";

let t: Awaited<ReturnType<typeof createTestDb>>;
let app: FastifyInstance;
type Role = "agency" | "nurse" | "admin";
const roles = new Map<string, Role>([["agency-a", "agency"], ["agency-b", "agency"], ["nurse-1", "nurse"], ["admin-1", "admin"]]);

beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db);
  process.env.DATABASE_URL = t.url;
  const mk = async (id: string, role: Role, name: string) => {
    await t.db.insert(users).values({ id, email: `${id}@example.com`, role, passwordHash: "x" });
    await t.db.insert(userProfiles).values({ userId: id, fullName: name });
    roles.set(id, role);
  };
  await mk("mgr-a", "agency", "Mia Manager");
  await t.db.insert(agencyMemberships).values({ id: "agm_mgr_a", userId: "mgr-a", agencyId: "agency-a", role: "manager" });
  await mk("viewer-a", "agency", "Vic Viewer");
  await t.db.insert(agencyMemberships).values({ id: "agm_viewer_a", userId: "viewer-a", agencyId: "agency-a", role: "viewer" });
  await mk("multi", "agency", "Multi Member");
  await t.db.insert(agencies).values({ id: "agency-z", name: "Alpha Staffing" });
  await t.db.insert(agencies).values({ id: "agency-dead", name: "Gone Agency", deletedAt: new Date() });
  await t.db.insert(agencyMemberships).values([
    { id: "agm_multi_a", userId: "multi", agencyId: "agency-a", role: "owner" },
    { id: "agm_multi_z", userId: "multi", agencyId: "agency-z", role: "viewer" },
    { id: "agm_multi_dead", userId: "multi", agencyId: "agency-dead", role: "owner" },
  ]);
  await mk("nurse-9", "nurse", "Nina Nine"); // long-lived license, so claims on 2099 shifts are eligible
  await t.db.insert(nurseProfiles).values({ userId: "nurse-9", networkId: "network-default" });
  await t.db.insert(credentials).values({
    id: "cred-nurse-9", nurseId: "nurse-9", type: "license", expiresOn: "2099-12-31", status: "verified", reviewedBy: "admin-1", reviewedAt: new Date("2026-01-01T00:00:00Z"),
  });
  app = buildApp();
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await t?.drop();
});

let ip = 0;
async function call(method: "GET" | "POST", url: string, who?: string, opts: { headers?: Record<string, string>; payload?: string } = {}) {
  const headers: Record<string, string> = { ...opts.headers };
  if (who) headers.authorization = `Bearer ${await signAccessToken({ id: who, role: roles.get(who)! })}`;
  const res = await app.inject({ method, url, headers, remoteAddress: `10.3.${Math.floor(++ip / 250)}.${ip % 250}`, ...(opts.payload === undefined ? {} : { payload: opts.payload }) });
  return { status: res.statusCode, body: res.json() as Record<string, unknown> };
}
let seq = 0;
async function mkShift(over: { agencyId?: string; networkId?: string; status?: "open" | "filled" | "completed"; claimedBy?: string } = {}) {
  const id = `shift-${7000 + ++seq}`;
  const claimed = over.status === "filled" || over.status === "completed";
  await t.db.insert(shifts).values({
    id, networkId: over.networkId ?? "network-default", agencyId: over.agencyId ?? "agency-a", role: "RN", shiftDate: "2099-02-01", startTime: "07:00", endTime: "19:00",
    timezone: "America/New_York", status: over.status ?? "open", createdBy: "admin-1",
    ...(claimed ? { claimedBy: over.claimedBy ?? "nurse-1", claimedAt: new Date() } : {}),
  });
  return id;
}
const withdraw = (id: string, who?: string, opts?: Parameters<typeof call>[3]) => call("POST", `/api/shifts/${id}/withdraw`, who, opts);
const err = (r: { status: number; body: unknown }, status: number, error: string) => expect(r).toMatchObject({ status, body: { error } });

describe("GET /api/me", () => {
  it("401 without a token", async () => err(await call("GET", "/api/me"), 401, ErrorMessage.unauthorized));

  it("nurse and admin: user only, agencies empty", async () => {
    const n = await call("GET", "/api/me", "nurse-1");
    expect(MeResponse.parse(n.body)).toEqual({ user: { id: "nurse-1", name: "Maria Lopez", email: "maria.lopez@example.com", role: "nurse" }, agencies: [] });
    const a = await call("GET", "/api/me", "admin-1");
    expect(MeResponse.parse(a.body)).toMatchObject({ user: { id: "admin-1", role: "admin" }, agencies: [] });
  });

  it("agency user: active memberships ordered by name, deleted agencies excluded", async () => {
    const r = await call("GET", "/api/me", "multi");
    expect(r.status).toBe(200);
    expect(MeResponse.parse(r.body).agencies).toEqual([
      { agencyId: "agency-z", name: "Alpha Staffing", role: "viewer" },
      { agencyId: "agency-a", name: "Sunrise Health Staffing", role: "owner" },
    ]);
  });

  it("ignores a stale X-Agency-Id (the client needs /api/me to discover valid agencies)", async () => {
    const r = await call("GET", "/api/me", "multi", { headers: { "x-agency-id": "agency-b" } });
    expect(r.status).toBe(200);
    // ...while every other route keeps the 403
    err(await call("GET", "/api/shifts", "multi", { headers: { "x-agency-id": "agency-b" } }), 403, ErrorMessage.forbidden);
  });

  it("a valid token for a user without a profile row is 401, not 500", async () => {
    await t.db.insert(users).values({ id: "noprof", email: "noprof@example.com", role: "nurse", passwordHash: "x" });
    roles.set("noprof", "nurse");
    err(await call("GET", "/api/me", "noprof"), 401, ErrorMessage.unauthorized);
  });

  it("never leaks the password hash", async () => expect(JSON.stringify((await call("GET", "/api/me", "nurse-1")).body)).not.toMatch(/hash|password/i));
});

describe("POST /api/shifts/:id/withdraw", () => {
  it("owner withdraws an open shift: 200 contract shape, row cancelled, audit with network+agency, no outbox", async () => {
    const id = await mkShift();
    const r = await withdraw(id, "agency-a");
    expect(r.status).toBe(200);
    expect(WithdrawShiftResponse.parse(r.body)).toMatchObject({ id, status: "cancelled", claimedBy: null, agencyId: "agency-a" });
    expect((await t.db.select().from(shifts).where(eq(shifts.id, id)))[0]).toMatchObject({ status: "cancelled", claimedBy: null });
    const log = await t.db.select().from(auditLog).where(and(eq(auditLog.entityId, id), eq(auditLog.action, "shift.withdrawn")));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actorUserId: "agency-a", actorRole: "agency", networkId: "network-default", agencyId: "agency-a", changes: { status: ["open", "cancelled"] } });
    expect(log[0]!.requestId).toBeTruthy();
    expect(await t.db.select().from(notifications)).toHaveLength(0);
  });

  it("manager and network admin may withdraw; viewer and nurse get 403", async () => {
    expect((await withdraw(await mkShift(), "mgr-a")).status).toBe(200);
    expect((await withdraw(await mkShift(), "admin-1")).status).toBe(200);
    const id = await mkShift();
    err(await withdraw(id, "viewer-a"), 403, ErrorMessage.forbidden);
    err(await withdraw(id, "nurse-1"), 403, ErrorMessage.forbidden);
    expect((await t.db.select().from(shifts).where(eq(shifts.id, id)))[0]!.status).toBe("open");
  });

  it("another agency's shift, unknown id, and malformed id: 404 Shift not found (no existence leak)", async () => {
    const foreign = await mkShift({ agencyId: "agency-b" });
    err(await withdraw(foreign, "agency-a"), 404, ErrorMessage.shiftNotFound);
    err(await withdraw("shift-nope", "agency-a"), 404, ErrorMessage.shiftNotFound);
    err(await withdraw("bad id!", "agency-a"), 404, ErrorMessage.shiftNotFound);
  });

  it("401 without token; not open (filled / already cancelled) = 409", async () => {
    err(await withdraw("shift-1"), 401, ErrorMessage.unauthorized);
    err(await withdraw(await mkShift({ status: "filled" }), "agency-a"), 409, ErrorMessage.shiftNotOpen);
    const id = await mkShift();
    expect((await withdraw(id, "agency-a")).status).toBe(200);
    err(await withdraw(id, "agency-a"), 409, ErrorMessage.shiftNotOpen);
  });

  it("empty JSON body is accepted; malformed JSON stays {error}", async () => {
    const json = { "content-type": "application/json" };
    expect((await withdraw(await mkShift(), "agency-a", { headers: json, payload: "" })).status).toBe(200);
    const bad = await withdraw(await mkShift(), "agency-a", { headers: json, payload: "{not json" });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body)).toEqual(["error"]);
  });

  it("10 concurrent withdraws: one 200, nine 409, one audit row", async () => {
    const id = await mkShift();
    const rs = await Promise.all(Array.from({ length: 10 }, () => withdraw(id, "agency-a")));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(9);
    expect(await t.db.select().from(auditLog).where(and(eq(auditLog.entityId, id), eq(auditLog.action, "shift.withdrawn")))).toHaveLength(1);
  });
});

describe("POST claim with Content-Type: application/json and an empty body", () => {
  it("is treated as {} (no FST_ERR_CTP_EMPTY_JSON_BODY)", async () => {
    const id = await mkShift();
    const r = await call("POST", `/api/shifts/${id}/claim`, "nurse-9", { headers: { "content-type": "application/json" }, payload: "" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id, status: "filled", claimedBy: "nurse-9" });
  });
});

describe("GET /api/nurses/me/shifts", () => {
  it("returns the nurse's filled + completed shifts only", async () => {
    const filled = await mkShift({ status: "filled" });
    const done = await mkShift({ status: "completed" });
    const open = await mkShift();
    await mkShift({ status: "filled", claimedBy: "nurse-9" }); // someone else's
    const r = await call("GET", "/api/nurses/me/shifts", "nurse-1");
    expect(r.status).toBe(200);
    const parsed = NurseShiftsResponse.parse(r.body);
    expect(parsed.shifts.every((s) => s.claimedBy === "nurse-1" && ["filled", "completed"].includes(s.status))).toBe(true);
    expect(parsed.shifts.map((s) => s.id)).toEqual(expect.arrayContaining([filled, done, "shift-2"]));
    expect(parsed.shifts.map((s) => s.id)).not.toContain(open);
  });

  it("is capped at the 200 most recent shifts, newest date first", async () => {
    await t.db.insert(users).values({ id: "nurse-cap", email: "cap@example.com", role: "nurse", passwordHash: "x" });
    await t.db.insert(userProfiles).values({ userId: "nurse-cap", fullName: "Cap Nurse" });
    await t.db.insert(nurseProfiles).values({ userId: "nurse-cap", networkId: "network-default" });
    roles.set("nurse-cap", "nurse");
    const day = (i: number) => new Date(Date.UTC(2090, 0, 1 + i)).toISOString().slice(0, 10);
    await t.db.insert(shifts).values(
      Array.from({ length: 205 }, (_, i) => ({
        id: `shift-cap-${i}`, networkId: "network-default", agencyId: "agency-a", role: "RN" as const, shiftDate: day(i), startTime: "07:00", endTime: "19:00",
        timezone: "America/New_York", status: "completed" as const, createdBy: "admin-1", claimedBy: "nurse-cap", claimedAt: new Date(),
      })),
    );
    const r = NurseShiftsResponse.parse((await call("GET", "/api/nurses/me/shifts", "nurse-cap")).body);
    expect(r.shifts).toHaveLength(200);
    expect(r.shifts[0]!.date).toBe(day(204));
    expect(r.shifts[199]!.date).toBe(day(5)); // the 5 oldest are cut
  });

  it("agency and admin 403, no token 401", async () => {
    err(await call("GET", "/api/nurses/me/shifts", "agency-a"), 403, ErrorMessage.forbidden);
    err(await call("GET", "/api/nurses/me/shifts", "admin-1"), 403, ErrorMessage.forbidden);
    err(await call("GET", "/api/nurses/me/shifts"), 401, ErrorMessage.unauthorized);
  });
});
