// GET /api/shifts (+ ?matchable), GET /api/agencies/:id/shifts, POST /api/shifts against a real throwaway Postgres.
import { AgencyShiftsResponse, CreateShiftResponse, ErrorBody, ErrorMessage, ListShiftsResponse } from "@shiftpatch/contracts";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import {
  agencies, agencyMemberships, credentials, facilities, hospitalNetworks, networkAgencies, networkMemberships, notifications, nurseProfiles, shifts, userProfiles, users,
} from "../../db/schema/index.js";
import { seed } from "../../db/seed.js";
import { createTestDb } from "../../db/test-db.js";
import { signAccessToken } from "../auth/tokens.js";
import type { Actor } from "../authz/actor.js";
import { listMatchable } from "./service.js";

let t: Awaited<ReturnType<typeof createTestDb>>;
let app: FastifyInstance;
type Role = "agency" | "nurse" | "admin";
const roles = new Map<string, Role>([["agency-a", "agency"], ["agency-b", "agency"], ["nurse-1", "nurse"], ["admin-1", "admin"]]);

async function makeUser(id: string, role: Role) {
  await t.db.insert(users).values({ id, email: `${id}@example.com`, role, passwordHash: "x" });
  await t.db.insert(userProfiles).values({ userId: id, fullName: id });
  roles.set(id, role);
}
const member = (userId: string, agencyId: string, role: "owner" | "manager" | "viewer") =>
  t.db.insert(agencyMemberships).values({ id: `agm_${userId}_${agencyId}`, userId, agencyId, role });
async function makeNurse(id: string, opts: { expiresOn: string; licenseType?: "RN" | "LPN" | "CNA"; status?: "pending" | "verified" | "rejected" }) {
  await makeUser(id, "nurse");
  await t.db.insert(nurseProfiles).values({ userId: id, networkId: "network-default", licenseType: opts.licenseType ?? null });
  const status = opts.status ?? "verified";
  await t.db.insert(credentials).values({
    id: `cred-${id}`, nurseId: id, type: "license", expiresOn: opts.expiresOn, status,
    ...(status === "pending" ? {} : { reviewedBy: "admin-1", reviewedAt: new Date("2026-01-01T00:00:00Z") }),
  });
}

beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db);
  process.env.DATABASE_URL = t.url;
  await t.db.insert(hospitalNetworks).values({ id: "network-2", name: "Second Network", defaultTimezone: "America/Chicago" });
  await t.db.insert(agencies).values({ id: "agency-c", name: "Gulf Staffing" });
  await t.db.insert(networkAgencies).values({ networkId: "network-2", agencyId: "agency-c" });
  const fac = { addressLine1: "1 Main St", city: "Tampa", state: "FL", postalCode: "33601" };
  await t.db.insert(facilities).values([
    { ...fac, id: "fac-1", networkId: "network-default", name: "Bay Hospital", timezone: "America/Chicago" },
    { ...fac, id: "fac-n2", networkId: "network-2", name: "Gulf Hospital", timezone: "America/Chicago" },
  ]);
  // people
  await makeUser("mgr-a", "agency"); await member("mgr-a", "agency-a", "manager");
  await makeUser("viewer-a", "agency"); await member("viewer-a", "agency-a", "viewer");
  await makeUser("multi", "agency"); await member("multi", "agency-a", "owner"); await member("multi", "agency-b", "manager");
  await makeUser("owner-c", "agency"); await member("owner-c", "agency-c", "owner");
  await makeUser("admin-2", "admin");
  await t.db.insert(networkMemberships).values({ id: "nwm-admin-2", userId: "admin-2", networkId: "network-2" });
  // nurses with far-future expiry so the HTTP tests never age out (seed nurse-1 expires 2027-01-01)
  await makeNurse("nurse-ok", { expiresOn: "2099-01-01" });
  await makeNurse("nurse-old", { expiresOn: "2020-01-01" });
  await makeNurse("nurse-lpn", { expiresOn: "2099-01-01", licenseType: "LPN" });
  await makeNurse("nurse-rej", { expiresOn: "2099-01-01", status: "rejected" });
  await makeNurse("nurse-pend", { expiresOn: "2099-01-01", status: "pending" });
  // extra shifts: soft-deleted in agency-a, open in the other network
  const base = { timezone: "America/New_York", role: "RN", shiftDate: "2099-02-01", startTime: "07:00", endTime: "19:00", status: "open" as const, createdBy: "admin-1" };
  await t.db.insert(shifts).values([
    { ...base, id: "shift-901", networkId: "network-default", agencyId: "agency-a", deletedAt: new Date() },
    { ...base, id: "shift-902", networkId: "network-2", agencyId: "agency-c" },
  ]);
  app = buildApp();
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await t?.drop();
});

type Json = { shifts: { id: string }[]; id: string; agencyId: string; [k: string]: unknown };
let ip = 0;
async function call(method: "GET" | "POST", url: string, who?: string, opts: { body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...opts.headers };
  if (who) headers.authorization = `Bearer ${await signAccessToken({ id: who, role: roles.get(who)! })}`;
  const res = await app.inject({ method, url, headers, remoteAddress: `10.1.${Math.floor(++ip / 250)}.${ip % 250}`, ...(opts.body === undefined ? {} : { payload: opts.body as object }) });
  return { status: res.statusCode, body: res.json() as Json };
}
const forbidden = (r: { status: number; body: unknown }, error = "Forbidden") => {
  expect(r.status).toBe(403);
  expect(r.body).toEqual({ error }); // exact
};
const ids = (r: { body: Json }) => r.body.shifts.map((s) => s.id);
const SHIFT_KEYS = ["agencyId", "agencyName", "claimedBy", "date", "endTime", "id", "role", "startTime", "status"];

describe("GET /api/shifts (marketplace)", () => {
  it("401 without a token", async () => expect(await call("GET", "/api/shifts")).toMatchObject({ status: 401, body: { error: "Unauthorized" } }));

  it.each(["nurse-1", "agency-a", "agency-b", "mgr-a", "viewer-a", "admin-1", "admin-2", "owner-c"])("%s: 200, all agencies, open + filled, exact keys", async (who) => {
    const r = await call("GET", "/api/shifts", who);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body)).toEqual(["shifts"]); // no pagination / extras
    const list = ListShiftsResponse.parse(r.body).shifts;
    expect(ids(r)).toEqual(["shift-1", "shift-2", "shift-3", "shift-902"]); // numeric order; shift-901 is soft-deleted
    expect(list.find((s) => s.id === "shift-2")).toMatchObject({ status: "filled", claimedBy: "nurse-1" }); // filled included
    for (const s of list) expect(Object.keys(s).sort()).toEqual(SHIFT_KEYS);
  });

  it("rows are the exact seeded shapes", async () => {
    const r = await call("GET", "/api/shifts", "nurse-1");
    expect(r.body.shifts[0]).toEqual({ id: "shift-1", agencyId: "agency-a", agencyName: "Sunrise Health Staffing", role: "RN", date: "2026-10-02", startTime: "19:00", endTime: "07:00", status: "open", claimedBy: null });
  });

  it("a stray X-Agency-Id (non-member) is 403 even here: the header is validated for every request (frontend must not send stale ones)", async () => {
    forbidden(await call("GET", "/api/shifts", "agency-a", { headers: { "x-agency-id": "agency-b" } }), "Agency not available");
    forbidden(await call("GET", "/api/shifts", "nurse-1", { headers: { "x-agency-id": "agency-a" } }), "Agency not available");
    expect((await call("GET", "/api/shifts", "agency-a", { headers: { "x-agency-id": "agency-a" } })).status).toBe(200);
  });

  it("matchable=false is the plain marketplace; an unknown value is 400", async () => {
    const r = await call("GET", "/api/shifts?matchable=false", "agency-a");
    expect(ids(r)).toEqual(["shift-1", "shift-2", "shift-3", "shift-902"]);
    const bad = await call("GET", "/api/shifts?matchable=yes", "nurse-ok");
    expect(bad.status).toBe(400);
    ErrorBody.parse(bad.body);
  });
});

describe("GET /api/shifts?matchable=true", () => {
  it("eligible nurse without a license type: open shifts of her network only (no filled, no other network, no deleted)", async () => {
    const r = await call("GET", "/api/shifts?matchable=true", "nurse-ok");
    expect(r.status).toBe(200);
    expect(ListShiftsResponse.parse(r.body).shifts.every((s) => s.status === "open")).toBe(true);
    expect(ids(r)).toEqual(["shift-1", "shift-3"]);
  });
  it("pending license counts; rejected and expired licenses see nothing", async () => {
    expect(ids(await call("GET", "/api/shifts?matchable=true", "nurse-pend"))).toEqual(["shift-1", "shift-3"]);
    expect(ids(await call("GET", "/api/shifts?matchable=true", "nurse-rej"))).toEqual([]);
    expect(ids(await call("GET", "/api/shifts?matchable=true", "nurse-old"))).toEqual([]);
  });
  it("license type applies only when populated (LPN nurse sees no RN shift)", async () => {
    expect(ids(await call("GET", "/api/shifts?matchable=true", "nurse-lpn"))).toEqual([]); // shift-1/3 are RN
    await t.db.insert(shifts).values({ id: "shift-903", networkId: "network-default", agencyId: "agency-a", timezone: "America/New_York", role: "LPN", shiftDate: "2098-03-01", startTime: "07:00", endTime: "19:00", createdBy: "admin-1" });
    expect(ids(await call("GET", "/api/shifts?matchable=true", "nurse-lpn"))).toEqual(["shift-903"]);
    expect(ids(await call("GET", "/api/shifts?matchable=true", "nurse-ok"))).toEqual(["shift-1", "shift-3", "shift-903"]); // no license type: no filter
    await t.db.delete(shifts).where(eq(shifts.id, "shift-903"));
  });
  it("eligibility uses the shift timezone and the day of work (fixed clock, boundary expiry)", async () => {
    await makeNurse("nurse-edge", { expiresOn: "2026-10-03" });
    const actor: Actor = { userId: "nurse-edge", role: "nurse", status: "active", agencies: [], networkIds: [], nurseNetworkId: "network-default", activeAgencyId: null };
    const matchable = async (now: string) => {
      const r = await listMatchable(t.db, actor, new Date(now));
      if (!r.ok) throw new Error("denied");
      return r.value.map((s) => s.id);
    };
    // shift-1 is 2026-10-02, shift-3 is 2026-10-04 (both New York). Valid on 10-02 for shift-1 only; shift-3 is after expiry.
    expect(await matchable("2026-10-02T12:00:00Z")).toEqual(["shift-1"]);
    // 10-04 02:00 UTC is still 10-03 in New York: expiry day is inclusive there. A UTC "today" (10-04) would drop shift-1.
    expect(await matchable("2026-10-04T02:00:00Z")).toEqual(["shift-1"]);
    // 10-04 05:00 UTC = 10-04 01:00 New York: the license has lapsed.
    expect(await matchable("2026-10-04T05:00:00Z")).toEqual([]);
  });
  it("default marketplace is unchanged for a nurse", async () => {
    expect(ids(await call("GET", "/api/shifts", "nurse-old"))).toEqual(["shift-1", "shift-2", "shift-3", "shift-902"]);
  });
  it.each(["agency-a", "viewer-a", "admin-1"])("%s: 403 Forbidden", async (who) => forbidden(await call("GET", "/api/shifts?matchable=true", who)));
  it("401 without a token", async () => expect((await call("GET", "/api/shifts?matchable=true")).status).toBe(401));
});

describe("GET /api/agencies/:agencyId/shifts", () => {
  it.each(["agency-a", "mgr-a", "viewer-a"])("%s (member of agency-a): 200 own shifts, exact keys, soft-deleted hidden", async (who) => {
    const r = await call("GET", "/api/agencies/agency-a/shifts", who);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(["agencyId", "shifts"]);
    expect(AgencyShiftsResponse.parse(r.body).agencyId).toBe("agency-a");
    expect(ids(r)).toEqual(["shift-1", "shift-2"]);
    for (const s of r.body.shifts) expect(Object.keys(s).sort()).toEqual(SHIFT_KEYS);
  });
  it("cross-agency: exactly 403 { error: Forbidden }", async () => {
    forbidden(await call("GET", "/api/agencies/agency-a/shifts", "agency-b"));
    forbidden(await call("GET", "/api/agencies/agency-b/shifts", "agency-a"));
    forbidden(await call("GET", "/api/agencies/agency-a/shifts", "owner-c"));
  });
  it("unknown agency is the same 403 as a foreign one; so is a malformed id", async () => {
    forbidden(await call("GET", "/api/agencies/nope/shifts", "agency-a"));
    forbidden(await call("GET", "/api/agencies/nope/shifts", "admin-1"));
    forbidden(await call("GET", "/api/agencies/a%20b/shifts", "agency-a"));
  });
  it("nurse: 403; no token: 401", async () => {
    forbidden(await call("GET", "/api/agencies/agency-a/shifts", "nurse-1"));
    expect((await call("GET", "/api/agencies/agency-a/shifts")).status).toBe(401);
  });
  it("admin sees agencies of their own network only", async () => {
    expect(ids(await call("GET", "/api/agencies/agency-b/shifts", "admin-1"))).toEqual(["shift-3"]);
    forbidden(await call("GET", "/api/agencies/agency-c/shifts", "admin-1")); // other network
    expect(ids(await call("GET", "/api/agencies/agency-c/shifts", "admin-2"))).toEqual(["shift-902"]);
    forbidden(await call("GET", "/api/agencies/agency-a/shifts", "admin-2"));
  });
  it("multi-agency user: any member agency works; the header must still name a membership", async () => {
    expect(ids(await call("GET", "/api/agencies/agency-a/shifts", "multi"))).toEqual(["shift-1", "shift-2"]);
    expect(ids(await call("GET", "/api/agencies/agency-b/shifts", "multi", { headers: { "x-agency-id": "agency-a" } }))).toEqual(["shift-3"]); // URL, not header, picks the agency
    forbidden(await call("GET", "/api/agencies/agency-a/shifts", "multi", { headers: { "x-agency-id": "agency-c" } }), "Agency not available"); // stray header
    forbidden(await call("GET", "/api/agencies/agency-c/shifts", "multi"));
  });
  it("revoked membership loses access immediately", async () => {
    await t.db.update(agencyMemberships).set({ revokedAt: new Date(), revokedBy: "admin-1" }).where(eq(agencyMemberships.id, "agm_viewer-a_agency-a"));
    forbidden(await call("GET", "/api/agencies/agency-a/shifts", "viewer-a"));
  });
});

describe("POST /api/shifts", () => {
  const body = { role: "RN", date: "2026-10-05", startTime: "07:00", endTime: "19:00" };
  const row = async (id: string) => (await t.db.select().from(shifts).where(eq(shifts.id, id)))[0]!;

  const num = (id: string) => Number(id.slice("shift-".length));
  let last = 3; // seeds are shift-1..3; the sequence only moves forward
  const created = (r: { body: Json }) => {
    expect(r.body.id).toMatch(/^shift-\d+$/);
    expect(num(r.body.id)).toBeGreaterThan(last);
    last = num(r.body.id);
    return r.body.id;
  };

  it("owner: 201, spec shape, generated shift-N, open, claimedBy null, network + default timezone populated", async () => {
    const r = await call("POST", "/api/shifts", "agency-a", { body });
    expect(r.status).toBe(201);
    const id = created(r);
    expect(CreateShiftResponse.parse(r.body)).toEqual({ id, agencyId: "agency-a", agencyName: "Sunrise Health Staffing", ...body, status: "open", claimedBy: null });
    expect(Object.keys(r.body).sort()).toEqual(SHIFT_KEYS);
    expect(await row(id)).toMatchObject({ networkId: "network-default", facilityId: null, timezone: "America/New_York", createdBy: "agency-a", status: "open", claimedBy: null });
  });
  it("manager: 201, next sequential ids", async () => {
    const r = await call("POST", "/api/shifts", "mgr-a", { body });
    expect(r.status).toBe(201);
    created(r);
    created(await call("POST", "/api/shifts", "agency-a", { body }));
  });
  it("revoked member, nurse, admin: 403 exact; no token: 401", async () => {
    await makeUser("revoked-a", "agency"); await member("revoked-a", "agency-a", "owner");
    await t.db.update(agencyMemberships).set({ revokedAt: new Date(), revokedBy: "admin-1" }).where(eq(agencyMemberships.id, "agm_revoked-a_agency-a"));
    forbidden(await call("POST", "/api/shifts", "revoked-a", { body }));
    forbidden(await call("POST", "/api/shifts", "nurse-ok", { body }));
    forbidden(await call("POST", "/api/shifts", "admin-1", { body }));
    expect((await call("POST", "/api/shifts", undefined, { body })).status).toBe(401);
  });
  it("active viewer is denied, and authorization runs before validation (invalid body still 403)", async () => {
    await makeUser("viewer-b", "agency"); await member("viewer-b", "agency-b", "viewer");
    forbidden(await call("POST", "/api/shifts", "viewer-b", { body }));
    forbidden(await call("POST", "/api/shifts", "viewer-b", { body: { role: "??" } }));
  });
  it("mass assignment: agencyId/networkId/status/claimedBy/id/createdBy/timezone in the body are ignored", async () => {
    const r = await call("POST", "/api/shifts", "agency-a", {
      body: { ...body, agencyId: "agency-b", networkId: "network-2", status: "filled", claimedBy: "nurse-1", id: "shift-1", createdBy: "agency-b", timezone: "UTC", deletedAt: "2020-01-01" },
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ agencyId: "agency-a", status: "open", claimedBy: null });
    expect(r.body.id).toMatch(/^shift-\d+$/);
    expect(r.body.id).not.toBe("shift-1");
    expect(await row(r.body.id)).toMatchObject({ agencyId: "agency-a", networkId: "network-default", status: "open", claimedBy: null, createdBy: "agency-a", timezone: "America/New_York", deletedAt: null });
  });
  it("multi-agency: no header 400 Select an agency; header picks the agency; non-member header 403", async () => {
    const none = await call("POST", "/api/shifts", "multi", { body });
    expect(none).toMatchObject({ status: 400, body: { error: ErrorMessage.agencyRequired } });
    const b = await call("POST", "/api/shifts", "multi", { body, headers: { "x-agency-id": "agency-b" } });
    expect(b).toMatchObject({ status: 201, body: { agencyId: "agency-b", agencyName: "Metro Care Partners" } });
    const a = await call("POST", "/api/shifts", "multi", { body: { ...body, agencyId: "agency-b" }, headers: { "x-agency-id": "agency-a" } });
    expect(a.body.agencyId).toBe("agency-a"); // header wins over body
    forbidden(await call("POST", "/api/shifts", "multi", { body, headers: { "x-agency-id": "agency-c" } }), "Agency not available");
    forbidden(await call("POST", "/api/shifts", "multi", { body, headers: { "x-agency-id": "" } }), "Agency not available");
    forbidden(await call("POST", "/api/shifts", "agency-a", { body, headers: { "x-agency-id": "agency-b" } }), "Agency not available"); // single-agency user, other agency
  });
  it("invalid fields: 400 { error } and nothing inserted", async () => {
    const before = (await t.db.select().from(shifts)).length;
    for (const bad of [
      { ...body, role: "MD" }, { ...body, date: "2026-02-30" }, { ...body, startTime: "7am" }, { ...body, endTime: "19:00:00" },
      { ...body, endTime: body.startTime }, { role: "RN" }, {}, { ...body, facilityId: "bad id!" },
    ]) {
      const r = await call("POST", "/api/shifts", "agency-a", { body: bad });
      expect(r.status).toBe(400);
      ErrorBody.parse(r.body);
    }
    expect((await call("POST", "/api/shifts", "agency-a")).status).toBe(400); // no body at all
    expect((await t.db.select().from(shifts)).length).toBe(before);
  });
  it("overnight shift (end < start) is valid", async () => {
    const r = await call("POST", "/api/shifts", "agency-a", { body: { ...body, startTime: "19:00", endTime: "07:00" } });
    expect(r).toMatchObject({ status: 201, body: { startTime: "19:00", endTime: "07:00" } });
  });
  it("facility of the agency network: accepted, timezone from the facility", async () => {
    const r = await call("POST", "/api/shifts", "agency-a", { body: { ...body, facilityId: "fac-1" } });
    expect(r.status).toBe(201);
    expect(Object.keys(r.body)).not.toContain("facilityId"); // response shape unchanged
    expect(await row(r.body.id)).toMatchObject({ facilityId: "fac-1", timezone: "America/Chicago" });
  });
  it("facility of another network or unknown: 400, nothing inserted", async () => {
    const before = (await t.db.select().from(shifts)).length;
    for (const facilityId of ["fac-n2", "fac-missing"]) {
      expect(await call("POST", "/api/shifts", "agency-a", { body: { ...body, facilityId } })).toMatchObject({ status: 400, body: { error: ErrorMessage.invalidFacility } });
    }
    expect((await t.db.select().from(shifts)).length).toBe(before);
    expect(await call("POST", "/api/shifts", "owner-c", { body: { ...body, facilityId: "fac-n2" } })).toMatchObject({ status: 201 }); // right network
  });
  it("network without facility uses its own default timezone", async () => {
    const r = await call("POST", "/api/shifts", "owner-c", { body });
    expect(await row(r.body.id)).toMatchObject({ networkId: "network-2", timezone: "America/Chicago" });
  });
  it("created shift shows up in the marketplace and the agency list", async () => {
    const id = created(await call("POST", "/api/shifts", "agency-a", { body }));
    expect(ids(await call("GET", "/api/agencies/agency-a/shifts", "agency-a"))).toContain(id);
    expect(ids(await call("GET", "/api/shifts", "nurse-1"))).toContain(id);
  });
});

describe("POST /api/shifts: shift.posted emails (E1)", () => {
  const posted = async (date: string) => (await t.db.select().from(notifications).where(sql`${notifications.template} = 'shift.posted' and ${notifications.payload}->>'date' = ${date}`));

  it("goes only to eligible nurses of the network: expired, rejected and role-mismatched licenses are skipped", async () => {
    const r = await call("POST", "/api/shifts", "agency-a", { body: { role: "RN", date: "2098-12-01", startTime: "07:00", endTime: "19:00", facilityId: "fac-1" } });
    expect(r.status).toBe(201);
    const rows = await posted("2098-12-01");
    // nurse-ok (valid), nurse-pend (pending counts). Not: nurse-old (expired), nurse-rej, nurse-lpn (LPN license vs RN shift), nurse-1/2 (license ends before 2099).
    expect(rows.map((n) => n.recipientEmail).sort()).toEqual(["nurse-ok@example.com", "nurse-pend@example.com"]);
    expect(rows[0]!.payload).toEqual({ shiftId: r.body.id, role: "RN", date: "2098-12-01", startTime: "07:00", endTime: "19:00", agencyName: "Sunrise Health Staffing", facilityName: "Bay Hospital" });
  });

  it("an LPN shift reaches the LPN nurse only among typed licenses; other network's nurses get nothing", async () => {
    await call("POST", "/api/shifts", "agency-a", { body: { role: "LPN", date: "2098-12-02", startTime: "07:00", endTime: "19:00" } });
    expect((await posted("2098-12-02")).map((n) => n.recipientEmail).sort()).toEqual(["nurse-lpn@example.com", "nurse-ok@example.com", "nurse-pend@example.com"]);
  });

  it("outbox insert fails -> 500 and no shift is created", async () => {
    await t.sql.unsafe(`create or replace function fail_posted() returns trigger language plpgsql as $$ begin raise exception 'forced failure'; end $$`);
    await t.sql.unsafe(`create trigger fail_posted before insert on notifications for each row when (new.template = 'shift.posted' and new.payload->>'date' = '2098-12-03') execute function fail_posted()`);
    try {
      const r = await call("POST", "/api/shifts", "agency-a", { body: { role: "RN", date: "2098-12-03", startTime: "07:00", endTime: "19:00" } });
      expect(r.status).toBe(500);
      expect(await t.db.select().from(shifts).where(eq(shifts.shiftDate, "2098-12-03"))).toHaveLength(0);
    } finally {
      await t.sql.unsafe(`drop trigger fail_posted on notifications`);
    }
  });
});
