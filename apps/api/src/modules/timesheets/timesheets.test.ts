// Timesheets end to end against a real throwaway Postgres: submit / resubmit, review, scoping, audit + outbox in the same tx.
import { ErrorMessage, TimesheetErrorMessage as Msg, TimesheetResponse, TimesheetsResponse } from "@shiftpatch/contracts";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import {
  agencies, agencyMemberships, auditLog, hospitalNetworks, networkAgencies, networkMemberships, notifications, nurseProfiles, shifts, timesheets, userProfiles, users,
} from "../../db/schema/index.js";
import { seed } from "../../db/seed.js";
import { createTestDb } from "../../db/test-db.js";
import { signAccessToken } from "../auth/tokens.js";
import { localDateTime, shiftHasStarted } from "./clock.js";

type Role = "agency" | "nurse" | "admin";
let t: Awaited<ReturnType<typeof createTestDb>>;
let app: FastifyInstance;
const roles = new Map<string, Role>([["agency-a", "agency"], ["agency-b", "agency"], ["nurse-1", "nurse"], ["nurse-2", "nurse"], ["admin-1", "admin"]]);

const PAST = "2026-10-10";
const FUTURE = "2099-02-01";
const HOURS = { clockIn: "07:00", clockOut: "19:30", breakMinutes: 30 }; // 12 h worked = 720 min

async function makeUser(id: string, role: Role) {
  await t.db.insert(users).values({ id, email: `${id}@example.com`, role, passwordHash: "x" });
  await t.db.insert(userProfiles).values({ userId: id, fullName: id });
  roles.set(id, role);
}
const member = (userId: string, agencyId: string, role: "owner" | "manager" | "viewer") =>
  t.db.insert(agencyMemberships).values({ id: `agm_${userId}_${agencyId}`, userId, agencyId, role });

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
  await makeUser("admin-2", "admin");
  await t.db.insert(networkMemberships).values({ id: "nwm-admin-2", userId: "admin-2", networkId: "network-2" });
  await makeUser("nurse-3", "nurse");
  await t.db.insert(nurseProfiles).values({ userId: "nurse-3", networkId: "network-2" });
  app = buildApp();
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await t?.drop();
});

let seq = 0;
/** A fresh shift so no test depends on another's state. Filled by nurse-1 unless told otherwise. */
async function mkShift(o: { date?: string; status?: "open" | "filled"; agencyId?: string; networkId?: string; claimedBy?: string; start?: string; end?: string; timezone?: string } = {}) {
  const id = `shift-${7000 + ++seq}`;
  const filled = (o.status ?? "filled") === "filled";
  await t.db.insert(shifts).values({
    id, networkId: o.networkId ?? "network-default", agencyId: o.agencyId ?? "agency-a", role: "RN", shiftDate: o.date ?? PAST, startTime: o.start ?? "07:00", endTime: o.end ?? "19:00",
    timezone: o.timezone ?? "America/New_York", status: filled ? "filled" : "open", createdBy: "admin-1",
    ...(filled ? { claimedBy: o.claimedBy ?? "nurse-1", claimedAt: new Date() } : {}),
  });
  return id;
}

let ip = 0;
async function call(method: "GET" | "POST", url: string, who: string | null, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { ...headers };
  if (who) h.authorization = `Bearer ${await signAccessToken({ id: who, role: roles.get(who)! })}`;
  const res = await app.inject({ method, url, headers: h, remoteAddress: `10.7.${Math.floor(++ip / 250)}.${ip % 250}`, ...(body === undefined ? {} : { payload: body as object }) });
  return { status: res.statusCode, body: res.json() as Record<string, any> };
}
const submit = (shiftId: string, who: string | null, body: unknown = HOURS) => call("POST", `/api/shifts/${shiftId}/timesheet`, who, body);
const approve = (id: string, who: string | null) => call("POST", `/api/timesheets/${id}/approve`, who);
const dispute = (id: string, who: string | null, body: unknown = { reason: "Break was longer" }) => call("POST", `/api/timesheets/${id}/dispute`, who, body);
/** Submitted timesheet for a fresh filled shift. */
async function mkSubmitted(o: Parameters<typeof mkShift>[0] = {}) {
  const shiftId = await mkShift(o);
  const r = await submit(shiftId, o.claimedBy ?? "nurse-1");
  expect(r.status).toBe(201);
  return { shiftId, id: r.body.id as string };
}
const shiftRow = async (id: string) => (await t.db.select({ status: shifts.status, claimedBy: shifts.claimedBy }).from(shifts).where(eq(shifts.id, id)))[0]!;
const tsRow = async (id: string) => (await t.db.select().from(timesheets).where(eq(timesheets.id, id)))[0]!;
const audits = (action: string, entityId: string) => t.db.select().from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.entityId, entityId)));
const mails = (template: string) => t.db.select().from(notifications).where(eq(notifications.template, template));

describe("clock helpers", () => {
  it("compares wall-clock in the shift's own timezone", () => {
    const now = new Date("2026-10-10T11:30:00Z"); // 07:30 in New York (EDT), 04:30 in Los Angeles
    expect(localDateTime("America/New_York", now)).toBe("2026-10-10T07:30");
    expect(shiftHasStarted({ shiftDate: "2026-10-10", startTime: "07:00:00", timezone: "America/New_York" }, now)).toBe(true);
    expect(shiftHasStarted({ shiftDate: "2026-10-10", startTime: "07:30", timezone: "America/New_York" }, now)).toBe(true);
    expect(shiftHasStarted({ shiftDate: "2026-10-10", startTime: "07:00", timezone: "America/Los_Angeles" }, now)).toBe(false);
    expect(shiftHasStarted({ shiftDate: "2026-10-11", startTime: "00:00", timezone: "America/New_York" }, now)).toBe(false);
  });
  it("midnight is 00:00, not 24:00", () => {
    expect(localDateTime("UTC", new Date("2026-10-10T00:05:00Z"))).toBe("2026-10-10T00:05");
  });
});

describe("POST /api/shifts/:id/timesheet", () => {
  it("happy path: 201 with the timesheet, audit row and outbox rows in the same go", async () => {
    const shiftId = await mkShift();
    const r = await submit(shiftId, "nurse-1", { ...HOURS, note: "  Covered the ER  " });
    expect(r.status).toBe(201);
    expect(TimesheetResponse.parse(r.body)).toMatchObject({
      shiftId, shiftDate: PAST, role: "RN", startTime: "07:00", endTime: "19:00", agencyId: "agency-a", agencyName: "Sunrise Health Staffing", nurseId: "nurse-1", nurseName: "Maria Lopez",
      clockIn: "07:00", clockOut: "19:30", breakMinutes: 30, workedMinutes: 720, note: "Covered the ER", status: "submitted", reviewedAt: null, reviewNote: null,
    });
    const id = r.body.id as string;
    const [a] = await audits("timesheet.submitted", id);
    expect(a).toMatchObject({ actorUserId: "nurse-1", actorRole: "nurse", networkId: "network-default", agencyId: "agency-a", entityType: "timesheet" });
    expect(a!.changes).toMatchObject({ status: [null, "submitted"], workedMinutes: 720 });
    expect(JSON.stringify(a!.changes)).not.toContain("Covered the ER"); // free text stays out of the audit row
    const out = (await mails("timesheet.submitted")).filter((m) => (m.payload as { shiftId: string }).shiftId === shiftId);
    expect(out.map((m) => m.recipientUserId).sort()).toEqual(["agency-a", "mgr-a"]); // owners + managers, never the viewer
    expect(JSON.stringify(out[0]!.payload)).not.toContain("Covered the ER");
  });

  it("breakMinutes defaults to 0, an overnight clock-out is the next day", async () => {
    const r = await submit(await mkShift({ start: "19:00", end: "07:00" }), "nurse-1", { clockIn: "19:00", clockOut: "07:00" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ breakMinutes: 0, workedMinutes: 720, clockIn: "19:00", clockOut: "07:00" });
  });

  it("a shift that has not started yet is a 400 with a clear message and writes nothing", async () => {
    const shiftId = await mkShift({ date: FUTURE });
    const r = await submit(shiftId, "nurse-1");
    expect(r).toMatchObject({ status: 400, body: { error: Msg.shiftNotStarted } });
    expect(await t.db.select().from(timesheets).where(eq(timesheets.shiftId, shiftId))).toEqual([]);
  });

  it("the seed shift (Oct 2026, filled by nurse-1) qualifies", async () => {
    expect((await submit("shift-2", "nurse-1")).status).toBe(201);
  });

  it("another nurse of the network gets 404 (existence hidden); other roles get 403; an open or missing shift is 404", async () => {
    const shiftId = await mkShift();
    expect(await submit(shiftId, "nurse-2")).toMatchObject({ status: 404, body: { error: Msg.shiftNotFound } });
    expect(await submit(shiftId, "nurse-3")).toMatchObject({ status: 404, body: { error: Msg.shiftNotFound } });
    for (const who of ["agency-a", "mgr-a", "viewer-a", "admin-1"]) expect(await submit(shiftId, who)).toMatchObject({ status: 403, body: { error: ErrorMessage.forbidden } });
    expect(await submit(await mkShift({ status: "open" }), "nurse-1")).toMatchObject({ status: 404 });
    expect(await submit("shift-nope", "nurse-1")).toMatchObject({ status: 404, body: { error: Msg.shiftNotFound } });
    expect(await submit(shiftId, null)).toMatchObject({ status: 401, body: { error: ErrorMessage.unauthorized } });
    expect(await t.db.select().from(timesheets).where(eq(timesheets.shiftId, shiftId))).toEqual([]);
  });

  it("a second submit while submitted or approved is 409", async () => {
    const { shiftId, id } = await mkSubmitted();
    expect(await submit(shiftId, "nurse-1")).toMatchObject({ status: 409, body: { error: Msg.alreadySubmitted } });
    expect((await approve(id, "agency-a")).status).toBe(200);
    expect(await submit(shiftId, "nurse-1")).toMatchObject({ status: 409, body: { error: Msg.alreadySubmitted } });
    expect(await t.db.select().from(timesheets).where(eq(timesheets.shiftId, shiftId))).toHaveLength(1);
  });

  it("resubmit after a dispute replaces the values, returns to submitted and clears the review fields", async () => {
    const { shiftId, id } = await mkSubmitted();
    expect((await dispute(id, "mgr-a", { reason: "Break was longer" })).status).toBe(200);
    expect(await tsRow(id)).toMatchObject({ status: "disputed", reviewNote: "Break was longer", reviewedBy: "mgr-a" });
    const r = await submit(shiftId, "nurse-1", { clockIn: "07:00", clockOut: "19:00", breakMinutes: 60, note: "Fixed" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ id, status: "submitted", breakMinutes: 60, workedMinutes: 660, note: "Fixed", reviewedAt: null, reviewNote: null });
    expect(await tsRow(id)).toMatchObject({ status: "submitted", reviewedBy: null, reviewedAt: null, reviewNote: null });
    expect(await t.db.select().from(timesheets).where(eq(timesheets.shiftId, shiftId))).toHaveLength(1);
    const [again] = await audits("timesheet.submitted", id).then((rows) => rows.slice(-1));
    expect(again!.changes).toMatchObject({ status: ["disputed", "submitted"], breakMinutes: [30, 60] });
    const resent = (await mails("timesheet.submitted")).filter((m) => (m.payload as { shiftId: string; resubmitted: string }).shiftId === shiftId);
    expect(resent.map((m) => (m.payload as { resubmitted: string }).resubmitted)).toContain("yes");
  });

  it.each<[string, unknown]>([
    ["break above 240", { ...HOURS, breakMinutes: 241 }],
    ["negative break", { ...HOURS, breakMinutes: -1 }],
    ["fractional break", { ...HOURS, breakMinutes: 1.5 }],
    ["zero worked time (in = out)", { clockIn: "07:00", clockOut: "07:00" }],
    ["break eats all the time", { clockIn: "07:00", clockOut: "07:30", breakMinutes: 30 }],
    ["break longer than the span", { clockIn: "07:00", clockOut: "07:10", breakMinutes: 20 }],
    ["more than 16 h worked", { clockIn: "06:00", clockOut: "23:00" }],
    ["note over 500 characters", { ...HOURS, note: "x".repeat(501) }],
    ["bad time format", { ...HOURS, clockIn: "7am" }],
    ["seconds in a time", { ...HOURS, clockIn: "07:00:30" }],
    ["missing clockOut", { clockIn: "07:00" }],
    ["unknown key", { ...HOURS, status: "approved" }],
    ["empty body", {}],
  ])("validation 400: %s", async (_n, body) => {
    const shiftId = await mkShift();
    const r = await submit(shiftId, "nurse-1", body);
    expect(r.status).toBe(400);
    expect(Object.keys(r.body)).toEqual(["error"]);
    expect(typeof r.body.error).toBe("string");
    expect(await t.db.select().from(timesheets).where(eq(timesheets.shiftId, shiftId))).toEqual([]);
  });

  it("boundary values are accepted: 240 break, exactly 16 h worked", async () => {
    expect((await submit(await mkShift(), "nurse-1", { clockIn: "06:00", clockOut: "02:00", breakMinutes: 240 })).body).toMatchObject({ workedMinutes: 960 });
    expect((await submit(await mkShift(), "nurse-1", { clockIn: "07:00", clockOut: "07:01" })).body).toMatchObject({ workedMinutes: 1 });
  });

  it("a break message and a worked-time message are specific", async () => {
    const s = await mkShift();
    expect((await submit(s, "nurse-1", { ...HOURS, breakMinutes: 241 })).body.error).toBe(Msg.invalidBreak);
    expect((await submit(s, "nurse-1", { clockIn: "07:00", clockOut: "07:00" })).body.error).toBe(Msg.invalidWorked);
  });
});

describe("GET /api/nurses/me/timesheets", () => {
  it("returns only the caller's own rows; non-nurses get 403", async () => {
    const mine = await mkSubmitted();
    const other = await mkSubmitted({ claimedBy: "nurse-2" });
    const r = await call("GET", "/api/nurses/me/timesheets", "nurse-1");
    expect(r.status).toBe(200);
    const ids = TimesheetsResponse.parse(r.body).timesheets.map((x) => x.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(other.id);
    expect(await call("GET", "/api/nurses/me/timesheets", "agency-a")).toMatchObject({ status: 403 });
    expect(await call("GET", "/api/nurses/me/timesheets", null)).toMatchObject({ status: 401 });
  });
});

describe("GET /api/timesheets", () => {
  it("agency members (viewer included) see their agency's rows only; ?status= filters", async () => {
    const a = await mkSubmitted();
    const b = await mkSubmitted({ agencyId: "agency-b" });
    const approved = await mkSubmitted();
    await approve(approved.id, "agency-a");
    for (const who of ["agency-a", "mgr-a", "viewer-a"]) {
      const r = await call("GET", "/api/timesheets", who);
      expect(r.status).toBe(200);
      const rows = TimesheetsResponse.parse(r.body).timesheets;
      expect(rows.length).toBeGreaterThan(0);
      expect(new Set(rows.map((x) => x.agencyId))).toEqual(new Set(["agency-a"]));
      expect(rows.map((x) => x.id)).toEqual(expect.arrayContaining([a.id, approved.id]));
      expect(rows.map((x) => x.id)).not.toContain(b.id);
    }
    const only = TimesheetsResponse.parse((await call("GET", "/api/timesheets?status=approved", "agency-a")).body).timesheets;
    expect(only.length).toBeGreaterThan(0);
    expect(only.every((x) => x.status === "approved")).toBe(true);
    expect(await call("GET", "/api/timesheets?status=bogus", "agency-a")).toMatchObject({ status: 400, body: { error: "Invalid query" } });
  });

  it("an admin sees their network, never another one; a nurse gets 403", async () => {
    const n1 = await mkSubmitted();
    const n2 = await mkSubmitted({ agencyId: "agency-c", networkId: "network-2", claimedBy: "nurse-3" });
    const ids = async (who: string) => TimesheetsResponse.parse((await call("GET", "/api/timesheets", who)).body).timesheets.map((x) => x.id);
    expect(await ids("admin-1")).toContain(n1.id);
    expect(await ids("admin-1")).not.toContain(n2.id);
    expect(await ids("admin-2")).toContain(n2.id);
    expect(await ids("admin-2")).not.toContain(n1.id);
    expect(await ids("owner-c")).toEqual(expect.arrayContaining([n2.id]));
    expect(await call("GET", "/api/timesheets", "nurse-1")).toMatchObject({ status: 403, body: { error: ErrorMessage.forbidden } });
    expect(await call("GET", "/api/timesheets", null)).toMatchObject({ status: 401 });
  });
});

describe("POST /api/timesheets/:id/approve", () => {
  it("approving completes the shift in the same transaction, keeps the nurse, writes audit and a nurse email", async () => {
    const { shiftId, id } = await mkSubmitted();
    expect(await shiftRow(shiftId)).toEqual({ status: "filled", claimedBy: "nurse-1" });
    const r = await approve(id, "mgr-a");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id, status: "approved", reviewNote: null });
    expect(r.body.reviewedAt).toEqual(expect.any(String));
    expect(await shiftRow(shiftId)).toEqual({ status: "completed", claimedBy: "nurse-1" });
    expect(await tsRow(id)).toMatchObject({ status: "approved", reviewedBy: "mgr-a" });
    const [a] = await audits("timesheet.approved", id);
    expect(a).toMatchObject({ actorUserId: "mgr-a", actorRole: "agency", agencyId: "agency-a", networkId: "network-default" });
    expect(a!.changes).toMatchObject({ status: ["submitted", "approved"], shiftStatus: ["filled", "completed"] });
    const out = (await mails("timesheet.approved")).filter((m) => (m.payload as { shiftId: string }).shiftId === shiftId);
    expect(out.map((m) => m.recipientUserId)).toEqual(["nurse-1"]);
  });

  it("a network admin may approve; a second approve is 409", async () => {
    const { id } = await mkSubmitted();
    expect((await approve(id, "admin-1")).status).toBe(200);
    expect(await approve(id, "admin-1")).toMatchObject({ status: 409, body: { error: Msg.notAwaitingReview } });
    expect(await dispute(id, "agency-a")).toMatchObject({ status: 409, body: { error: Msg.notAwaitingReview } });
  });

  it("viewer and nurse get 403; another agency, a foreign admin and a missing id get 404; nothing changes", async () => {
    const { shiftId, id } = await mkSubmitted();
    expect(await approve(id, "viewer-a")).toMatchObject({ status: 403, body: { error: ErrorMessage.forbidden } });
    expect(await approve(id, "nurse-1")).toMatchObject({ status: 403 });
    const hidden = { status: 404, body: { error: Msg.timesheetNotFound } };
    expect(await approve(id, "agency-b")).toMatchObject(hidden);
    expect(await approve(id, "owner-c")).toMatchObject(hidden);
    expect(await approve(id, "admin-2")).toMatchObject(hidden); // cross-network admin
    expect(await approve("ts_nope", "agency-a")).toMatchObject(hidden);
    expect(await approve(id, null)).toMatchObject({ status: 401 });
    expect(await tsRow(id)).toMatchObject({ status: "submitted", reviewedAt: null });
    expect(await shiftRow(shiftId)).toEqual({ status: "filled", claimedBy: "nurse-1" });
  });

  it("refuses when the nurse cancelled after submitting (shift no longer filled)", async () => {
    const { shiftId, id } = await mkSubmitted();
    const c = await call("POST", `/api/shifts/${shiftId}/cancel`, "nurse-1", { reason: "advance" });
    expect(c.status).toBe(200);
    expect(await approve(id, "agency-a")).toMatchObject({ status: 409, body: { error: Msg.shiftNotFilled } });
    expect(await tsRow(id)).toMatchObject({ status: "submitted" });
  });
});

describe("POST /api/timesheets/:id/dispute", () => {
  it("dispute stores the reason, leaves the shift filled, audits and emails the nurse without the reason", async () => {
    const { shiftId, id } = await mkSubmitted();
    const r = await dispute(id, "agency-a", { reason: "  Break was longer  " });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id, status: "disputed", reviewNote: "Break was longer" });
    expect(await shiftRow(shiftId)).toEqual({ status: "filled", claimedBy: "nurse-1" });
    const [a] = await audits("timesheet.disputed", id);
    expect(a!.changes).toEqual({ status: ["submitted", "disputed"] });
    const out = (await mails("timesheet.disputed")).filter((m) => (m.payload as { shiftId: string }).shiftId === shiftId);
    expect(out.map((m) => m.recipientUserId)).toEqual(["nurse-1"]);
    expect(JSON.stringify(out[0]!.payload)).not.toContain("Break was longer");
  });

  it.each<[string, unknown]>([
    ["missing reason", {}], ["empty reason", { reason: "" }], ["blank reason", { reason: "   " }], ["reason over 500", { reason: "x".repeat(501) }], ["unknown key", { reason: "ok", status: "approved" }],
  ])("validation 400: %s", async (_n, body) => {
    const { id } = await mkSubmitted();
    const r = await dispute(id, "agency-a", body);
    expect(r.status).toBe(400);
    expect(Object.keys(r.body)).toEqual(["error"]);
    expect(await tsRow(id)).toMatchObject({ status: "submitted" });
  });

  it("viewer 403, other agency 404, cross-network admin 404, authorization runs before validation", async () => {
    const { id } = await mkSubmitted();
    expect(await dispute(id, "viewer-a")).toMatchObject({ status: 403 });
    expect(await dispute(id, "viewer-a", {})).toMatchObject({ status: 403 });
    expect(await dispute(id, "agency-b")).toMatchObject({ status: 404, body: { error: Msg.timesheetNotFound } });
    expect(await dispute(id, "admin-2")).toMatchObject({ status: 404 });
    expect(await dispute(id, "agency-b", {})).toMatchObject({ status: 404 });
    expect(await tsRow(id)).toMatchObject({ status: "submitted" });
  });
});

describe("atomicity", () => {
  it("an outbox failure rolls back the approval and the shift completion", async () => {
    const { shiftId, id } = await mkSubmitted();
    await t.sql.unsafe(`create or replace function ts_block_outbox() returns trigger language plpgsql as $$ begin raise exception 'outbox blocked'; end $$`);
    await t.sql.unsafe(`create trigger ts_block before insert on notifications for each row when (new.template = 'timesheet.approved') execute function ts_block_outbox()`);
    try {
      expect((await approve(id, "agency-a")).status).toBe(500);
    } finally {
      await t.sql.unsafe(`drop trigger ts_block on notifications`);
    }
    expect(await tsRow(id)).toMatchObject({ status: "submitted", reviewedAt: null });
    expect(await shiftRow(shiftId)).toEqual({ status: "filled", claimedBy: "nurse-1" });
    expect(await audits("timesheet.approved", id)).toEqual([]);
  }, 20_000);
});
