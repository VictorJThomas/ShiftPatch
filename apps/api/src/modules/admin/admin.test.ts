// Additive read/review routes (UI polish) against a real throwaway Postgres: filters, coverage, nurse detail, admin users, credential review.
import {
  AdminAgencyResponse, AdminCoverageResponse, AdminNurseResponse, AdminUsersResponse, AgencyCoverageResponse, ErrorBody, ListShiftsResponse, ReviewCredentialResponse, ShiftNurseResponse,
} from "@shiftpatch/contracts";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import {
  agencies, agencyMemberships, auditLog, credentials, files, hospitalNetworks, networkAgencies, networkMemberships, notifications, nurseProfiles, shifts, userProfiles, users,
} from "../../db/schema/index.js";
import { seed } from "../../db/seed.js";
import { createTestDb } from "../../db/test-db.js";
import { signAccessToken } from "../auth/tokens.js";

let t: Awaited<ReturnType<typeof createTestDb>>;
let app: FastifyInstance;
type Role = "agency" | "nurse" | "admin";
const roles = new Map<string, Role>([["agency-a", "agency"], ["agency-b", "agency"], ["nurse-1", "nurse"], ["nurse-2", "nurse"], ["admin-1", "admin"]]);

async function makeUser(id: string, role: Role, fullName: string) {
  await t.db.insert(users).values({ id, email: `${id}@example.com`, role, passwordHash: "x" });
  await t.db.insert(userProfiles).values({ userId: id, fullName });
  roles.set(id, role);
}
const member = (userId: string, agencyId: string, role: "owner" | "manager" | "viewer") =>
  t.db.insert(agencyMemberships).values({ id: `agm_${userId}_${agencyId}`, userId, agencyId, role });

const SECRET_KEY = "credentials/00000000-0000-4000-8000-secretsecret";

beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db);
  process.env.DATABASE_URL = t.url;
  // Second network: its own admin, agency, nurse (with a claimed shift) - everything below must stay invisible to network-default's admin.
  await t.db.insert(hospitalNetworks).values({ id: "network-2", name: "Second Network" });
  await t.db.insert(agencies).values({ id: "agency-c", name: "Gulf Staffing" });
  await t.db.insert(networkAgencies).values({ networkId: "network-2", agencyId: "agency-c" });
  await makeUser("admin-2", "admin", "Other Admin");
  await t.db.insert(networkMemberships).values({ id: "nwm-admin-2", userId: "admin-2", networkId: "network-2" });
  await makeUser("owner-c", "agency", "Owner C");
  await member("owner-c", "agency-c", "owner");
  await makeUser("nurse-n2", "nurse", "Zed Outsider");
  await t.db.insert(nurseProfiles).values({ userId: "nurse-n2", networkId: "network-2" });
  await t.db.insert(credentials).values({ id: "cred-n2", nurseId: "nurse-n2", type: "license", expiresOn: "2099-01-01", status: "pending" });
  const base = { timezone: "America/New_York", role: "RN", shiftDate: "2099-02-01", startTime: "07:00", endTime: "19:00", createdBy: "admin-2" };
  await t.db.insert(shifts).values({ ...base, id: "shift-902", networkId: "network-2", agencyId: "agency-c", status: "filled", claimedBy: "nurse-n2", claimedAt: new Date() });
  // People inside network-default
  await makeUser("mgr-a", "agency", "Manager A");
  await member("mgr-a", "agency-a", "manager");
  await makeUser("viewer-a", "agency", "Viewer A");
  await member("viewer-a", "agency-a", "viewer");
  // nurse-1 gets a pending TB credential with a stored file (the object key must never surface)
  await t.db.insert(files).values({ id: "file-1", bucket: "private_credentials", objectKey: SECRET_KEY, mimeType: "application/pdf", sizeBytes: 10, sha256: "a".repeat(64), uploadedBy: "nurse-1" });
  await t.db.insert(credentials).values({ id: "cred-tb-1", nurseId: "nurse-1", type: "tb_screening", screenedOn: "2026-05-01", status: "pending", fileId: "file-1" });
  // a nurse with a wildcard in her name, to prove LIKE characters are literals
  await makeUser("nurse-pct", "nurse", "100% Nurse");
  await t.db.insert(nurseProfiles).values({ userId: "nurse-pct", networkId: "network-default", licenseType: "LPN" });
  await t.db.insert(shifts).values({ ...base, id: "shift-910", networkId: "network-default", agencyId: "agency-b", status: "filled", claimedBy: "nurse-pct", claimedAt: new Date() });
  app = buildApp();
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await t?.drop();
});

let ip = 0;
async function call(method: "GET" | "PATCH", url: string, who?: string, opts: { body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...opts.headers };
  if (who) headers.authorization = `Bearer ${await signAccessToken({ id: who, role: roles.get(who)! })}`;
  const res = await app.inject({ method, url, headers, remoteAddress: `10.2.${Math.floor(++ip / 250)}.${ip % 250}`, ...(opts.body === undefined ? {} : { payload: opts.body as object }) });
  return { status: res.statusCode, body: res.json() as Record<string, any>, raw: res.body }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const errorIs = (r: { status: number; body: unknown }, status: number, error: string) => {
  expect(r.status).toBe(status);
  expect(ErrorBody.parse(r.body)).toEqual({ error });
};
const ids = (r: { body: Record<string, any> }) => (r.body.shifts as { id: string }[]).map((s) => s.id); // eslint-disable-line @typescript-eslint/no-explicit-any

describe("GET /api/shifts filters", () => {
  it("no params = the full spec list (unchanged)", async () => {
    expect(ids(await call("GET", "/api/shifts", "nurse-1"))).toEqual(["shift-1", "shift-2", "shift-3", "shift-902", "shift-910"]);
  });
  it("status / role / date / agencyId AND together", async () => {
    expect(ids(await call("GET", "/api/shifts?status=open", "nurse-1"))).toEqual(["shift-1", "shift-3"]);
    expect(ids(await call("GET", "/api/shifts?role=LPN", "nurse-1"))).toEqual(["shift-2"]);
    expect(ids(await call("GET", "/api/shifts?date=2026-10-04", "nurse-1"))).toEqual(["shift-3"]);
    expect(ids(await call("GET", "/api/shifts?agencyId=agency-a&status=open", "nurse-1"))).toEqual(["shift-1"]);
    expect(ids(await call("GET", "/api/shifts?status=filled&role=RN&agencyId=agency-a", "nurse-1"))).toEqual([]);
  });
  it("filters AND with matchable", async () => {
    const r = await call("GET", "/api/shifts?matchable=true&agencyId=agency-b", "nurse-1");
    expect(ids(r)).toEqual(["shift-3"]);
    expect(ListShiftsResponse.parse(r.body).shifts).toHaveLength(1);
  });
  it("invalid values are a 400 with the error shape", async () => {
    for (const q of ["status=bogus", "role=MD", "date=2026-02-30", "agencyId=a%20b"]) errorIs(await call("GET", `/api/shifts?${q}`, "nurse-1"), 400, "Invalid query");
  });
});

describe("GET /api/agencies/:agencyId/coverage", () => {
  it("401 without a token", async () => expect((await call("GET", "/api/agencies/agency-a/coverage")).status).toBe(401));

  it("members (viewer included) and the network admin get rows with claimedByName; exact keys", async () => {
    for (const who of ["agency-a", "mgr-a", "viewer-a", "admin-1"]) {
      const r = await call("GET", "/api/agencies/agency-a/coverage", who);
      expect(r.status).toBe(200);
      const parsed = AgencyCoverageResponse.parse(r.body);
      expect(parsed.agencyId).toBe("agency-a");
      expect(parsed.shifts.map((s) => s.id)).toEqual(["shift-1", "shift-2"]);
      expect(parsed.shifts[0]).toMatchObject({ claimedBy: null, claimedByName: null });
      expect(parsed.shifts[1]).toMatchObject({ claimedBy: "nurse-1", claimedByName: "Maria Lopez" });
      expect(Object.keys(r.body.shifts[1]).sort()).toEqual(["agencyId", "agencyName", "claimedBy", "claimedByName", "date", "endTime", "id", "role", "startTime", "status"]);
    }
  });
  it("authz matrix: other agency 403, nurse 403, other-network admin 403, unknown agency 403", async () => {
    for (const who of ["agency-b", "nurse-1", "admin-2", "owner-c"]) errorIs(await call("GET", "/api/agencies/agency-a/coverage", who), 403, "Forbidden");
    errorIs(await call("GET", "/api/agencies/nope/coverage", "admin-1"), 403, "Forbidden");
  });
  it("authorization runs before validation (a stranger with a bad query still gets 403)", async () => {
    errorIs(await call("GET", "/api/agencies/agency-a/coverage?status=bogus", "agency-b"), 403, "Forbidden");
    errorIs(await call("GET", "/api/agencies/agency-a/coverage?status=bogus", "agency-a"), 400, "Invalid query");
  });
  it("filters and case-insensitive q on nurse name and shift id", async () => {
    const q = async (s: string) => ids(await call("GET", `/api/agencies/agency-a/coverage?${s}`, "agency-a"));
    expect(await q("status=open")).toEqual(["shift-1"]);
    expect(await q("role=LPN&date=2026-10-03")).toEqual(["shift-2"]);
    expect(await q("q=maria")).toEqual(["shift-2"]);
    expect(await q("q=LOPEZ")).toEqual(["shift-2"]);
    expect(await q("q=shift-1")).toEqual(["shift-1"]);
    expect(await q("q=nobody")).toEqual([]);
  });
});

describe("GET /api/admin/coverage", () => {
  it("401 / 403 for every non-admin role", async () => {
    expect((await call("GET", "/api/admin/coverage")).status).toBe(401);
    for (const who of ["nurse-1", "agency-a", "viewer-a"]) errorIs(await call("GET", "/api/admin/coverage", who), 403, "Forbidden");
  });
  it("network-scoped rows + totals + status counts (other network invisible)", async () => {
    const r = await call("GET", "/api/admin/coverage", "admin-1");
    expect(r.status).toBe(200);
    const parsed = AdminCoverageResponse.parse(r.body);
    expect(parsed.shifts.map((s) => s.id)).toEqual(["shift-1", "shift-2", "shift-3", "shift-910"]); // shift-902 is network-2
    expect(parsed).toMatchObject({ page: 1, pageSize: 25, total: 4, statusCounts: { open: 2, filled: 2, cancelled: 0, completed: 0 } });
    expect(parsed.shifts.find((s) => s.id === "shift-2")?.claimedByName).toBe("Maria Lopez");
    const other = AdminCoverageResponse.parse((await call("GET", "/api/admin/coverage", "admin-2")).body);
    expect(other.shifts.map((s) => s.id)).toEqual(["shift-902"]);
  });
  it("status filter changes total and rows but not the chip counts", async () => {
    const parsed = AdminCoverageResponse.parse((await call("GET", "/api/admin/coverage?status=open", "admin-1")).body);
    expect(parsed.shifts.map((s) => s.id)).toEqual(["shift-1", "shift-3"]);
    expect(parsed.total).toBe(2);
    expect(parsed.statusCounts).toEqual({ open: 2, filled: 2, cancelled: 0, completed: 0 });
  });
  it("agencyId filter is inside the network scope (a foreign agency yields nothing)", async () => {
    expect(ids(await call("GET", "/api/admin/coverage?agencyId=agency-b", "admin-1"))).toEqual(["shift-3", "shift-910"]);
    expect(ids(await call("GET", "/api/admin/coverage?agencyId=agency-c", "admin-1"))).toEqual([]);
  });
  it("q matches agency name AND nurse name AND shift id, case-insensitively", async () => {
    const q = async (s: string) => ids(await call("GET", `/api/admin/coverage?q=${encodeURIComponent(s)}`, "admin-1"));
    expect(await q("sunrise")).toEqual(["shift-1", "shift-2"]); // agency
    expect(await q("MARIA")).toEqual(["shift-2"]); // nurse
    expect(await q("shift-3")).toEqual(["shift-3"]); // id
    expect(await q("zed")).toEqual([]); // nurse of another network
    const counts = AdminCoverageResponse.parse((await call("GET", "/api/admin/coverage?q=maria", "admin-1")).body).statusCounts;
    expect(counts).toEqual({ open: 0, filled: 1, cancelled: 0, completed: 0 }); // counts follow q
  });
  it("LIKE wildcards in q are literals", async () => {
    expect(ids(await call("GET", `/api/admin/coverage?q=${encodeURIComponent("100%")}`, "admin-1"))).toEqual(["shift-910"]);
    expect(ids(await call("GET", `/api/admin/coverage?q=${encodeURIComponent("%")}`, "admin-1"))).toEqual(["shift-910"]);
    expect(ids(await call("GET", `/api/admin/coverage?q=${encodeURIComponent("_")}`, "admin-1"))).toEqual([]);
    expect(ids(await call("GET", `/api/admin/coverage?q=${encodeURIComponent("sh_ft")}`, "admin-1"))).toEqual([]);
  });
  it("sort is global (date, start time, id) across pages, default asc", async () => {
    const all = AdminCoverageResponse.parse((await call("GET", "/api/admin/coverage", "admin-1")).body).shifts;
    const key = (s: { date: string; startTime: string }) => `${s.date}T${s.startTime}`;
    expect(all.map(key)).toEqual([...all.map(key)].sort()); // default = asc
    const desc = AdminCoverageResponse.parse((await call("GET", "/api/admin/coverage?sort=desc", "admin-1")).body).shifts;
    expect(desc.map((s) => s.id)).toEqual([...all.map((s) => s.id)].reverse());
    const p1 = ids(await call("GET", "/api/admin/coverage?sort=desc&pageSize=3&page=1", "admin-1"));
    const p2 = ids(await call("GET", "/api/admin/coverage?sort=desc&pageSize=3&page=2", "admin-1"));
    expect([...p1, ...p2]).toEqual(desc.map((s) => s.id)); // pages stitch into the global order
    errorIs(await call("GET", "/api/admin/coverage?sort=sideways", "admin-1"), 400, "Invalid query");
  });
  it("pagination + validation (pageSize capped at 100)", async () => {
    const p2 = AdminCoverageResponse.parse((await call("GET", "/api/admin/coverage?pageSize=2&page=2", "admin-1")).body);
    expect(p2.shifts.map((s) => s.id)).toEqual(["shift-3", "shift-910"]);
    expect(p2).toMatchObject({ page: 2, pageSize: 2, total: 4 });
    for (const q of ["pageSize=101", "pageSize=0", "page=0", "status=bogus", "q=", "agencyId=a%20b"]) errorIs(await call("GET", `/api/admin/coverage?${q}`, "admin-1"), 400, "Invalid query");
  });
});

describe("GET /api/shifts/:id/nurse", () => {
  it("owning agency owner/manager and network admin see the nurse; credentials carry no keys or urls", async () => {
    for (const who of ["agency-a", "mgr-a", "admin-1"]) {
      const r = await call("GET", "/api/shifts/shift-2/nurse", who);
      expect(r.status).toBe(200);
      const nurse = ShiftNurseResponse.parse(r.body);
      expect(nurse).toMatchObject({ id: "nurse-1", name: "Maria Lopez", email: "maria.lopez@example.com", licenseType: null });
      expect(nurse.credentials.map((c) => c.id).sort()).toEqual(["cred-nurse-1", "cred-tb-1"]);
      expect(nurse.credentials.find((c) => c.id === "cred-tb-1")).toMatchObject({ type: "tb_screening", status: "pending", screenedOn: "2026-05-01", hasFile: true });
      expect(r.raw).not.toContain(SECRET_KEY);
      expect(r.raw).not.toMatch(/objectKey|object_key|credentials\/0000|sha256|file-1|https?:\/\//);
    }
  });
  it("viewer and other agencies are hidden (404), nurses 403, other-network admin 404", async () => {
    for (const who of ["viewer-a", "agency-b", "admin-2", "owner-c"]) errorIs(await call("GET", "/api/shifts/shift-2/nurse", who), 404, "Shift not found");
    errorIs(await call("GET", "/api/shifts/shift-2/nurse", "nurse-1"), 403, "Forbidden");
    errorIs(await call("GET", "/api/shifts/shift-2/nurse"), 401, "Unauthorized");
  });
  it("cross-tenant shift id and unknown id answer identically (404)", async () => {
    errorIs(await call("GET", "/api/shifts/shift-902/nurse", "admin-1"), 404, "Shift not found");
    errorIs(await call("GET", "/api/shifts/shift-9999/nurse", "admin-1"), 404, "Shift not found");
    errorIs(await call("GET", "/api/shifts/bad%20id/nurse", "admin-1"), 404, "Shift not found");
  });
  it("an open shift has no nurse: 404 with its own message, only after authorization", async () => {
    errorIs(await call("GET", "/api/shifts/shift-1/nurse", "agency-a"), 404, "No nurse has claimed this shift");
    errorIs(await call("GET", "/api/shifts/shift-1/nurse", "agency-b"), 404, "Shift not found");
  });
});

describe("GET /api/admin/users, /nurses/:id, /agencies/:id", () => {
  it("403 for non-admins, 401 anonymous, 400 without or with a bad type", async () => {
    expect((await call("GET", "/api/admin/users?type=nurse")).status).toBe(401);
    for (const who of ["nurse-1", "agency-a"]) errorIs(await call("GET", "/api/admin/users?type=nurse", who), 403, "Forbidden");
    for (const q of ["", "type=admin", "type=nurse&limit=101", "type=nurse&cursor=%25%25"]) errorIs(await call("GET", `/api/admin/users?${q}`, "admin-1"), 400, "Invalid query");
  });
  it("nurse list is network-scoped, minimal rows, searchable by name or email, with a cursor", async () => {
    const all = AdminUsersResponse.parse((await call("GET", "/api/admin/users?type=nurse", "admin-1")).body);
    expect(all.items.map((i) => i.id)).toEqual(["nurse-1", "nurse-2", "nurse-pct"]);
    expect(Object.keys(all.items[0]!).sort()).toEqual(["email", "id", "licenseType", "name", "type"]);
    expect(all.nextCursor).toBeNull();
    const byName = AdminUsersResponse.parse((await call("GET", "/api/admin/users?type=nurse&q=james", "admin-1")).body);
    expect(byName.items.map((i) => i.id)).toEqual(["nurse-2"]);
    expect(AdminUsersResponse.parse((await call("GET", "/api/admin/users?type=nurse&q=COOK%40", "admin-1")).body).items.map((i) => i.id)).toEqual(["nurse-2"]); // email match, case-insensitive
    const first = await call("GET", "/api/admin/users?type=nurse&limit=2", "admin-1");
    const page1 = AdminUsersResponse.parse(first.body);
    expect(page1.items.map((i) => i.id)).toEqual(["nurse-1", "nurse-2"]);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = AdminUsersResponse.parse((await call("GET", `/api/admin/users?type=nurse&limit=2&cursor=${page1.nextCursor}`, "admin-1")).body);
    expect(page2.items.map((i) => i.id)).toEqual(["nurse-pct"]);
    expect(page2.nextCursor).toBeNull();
  });
  it("agency list is network-scoped and searchable", async () => {
    const all = AdminUsersResponse.parse((await call("GET", "/api/admin/users?type=agency", "admin-1")).body);
    expect(all.items.map((i) => i.id)).toEqual(["agency-a", "agency-b"]);
    expect(all.items[0]).toEqual({ id: "agency-a", type: "agency", name: "Sunrise Health Staffing", email: null, licenseType: null });
    expect(AdminUsersResponse.parse((await call("GET", "/api/admin/users?type=agency&q=METRO", "admin-1")).body).items.map((i) => i.id)).toEqual(["agency-b"]);
    expect(AdminUsersResponse.parse((await call("GET", "/api/admin/users?type=agency", "admin-2")).body).items.map((i) => i.id)).toEqual(["agency-c"]);
  });
  it("an agency whose network link is suspended is hidden from the list and the detail", async () => {
    await t.db.insert(agencies).values({ id: "agency-susp", name: "Suspended Staffing" });
    await t.db.insert(networkAgencies).values({ networkId: "network-default", agencyId: "agency-susp", status: "suspended" });
    try {
      expect(AdminUsersResponse.parse((await call("GET", "/api/admin/users?type=agency", "admin-1")).body).items.map((i) => i.id)).toEqual(["agency-a", "agency-b"]);
      errorIs(await call("GET", "/api/admin/agencies/agency-susp", "admin-1"), 404, "Not found");
    } finally {
      await t.db.delete(networkAgencies).where(and(eq(networkAgencies.agencyId, "agency-susp"), eq(networkAgencies.networkId, "network-default")));
      await t.db.delete(agencies).where(eq(agencies.id, "agency-susp"));
    }
  });
  it("nurse detail: credentials with id, no keys; foreign network and unknown are the same 404", async () => {
    const r = await call("GET", "/api/admin/nurses/nurse-1", "admin-1");
    expect(r.status).toBe(200);
    expect(AdminNurseResponse.parse(r.body).credentials.map((c) => c.id).sort()).toEqual(["cred-nurse-1", "cred-tb-1"]);
    expect(r.raw).not.toContain(SECRET_KEY);
    errorIs(await call("GET", "/api/admin/nurses/nurse-n2", "admin-1"), 404, "Not found");
    errorIs(await call("GET", "/api/admin/nurses/nobody", "admin-1"), 404, "Not found");
    errorIs(await call("GET", "/api/admin/nurses/agency-a", "admin-1"), 404, "Not found"); // a user that is not a nurse
    errorIs(await call("GET", "/api/admin/nurses/nurse-1", "agency-a"), 403, "Forbidden");
    errorIs(await call("GET", "/api/admin/nurses/nurse-1", "nurse-1"), 403, "Forbidden");
  });
  it("agency detail: members + shift counts; foreign agency 404", async () => {
    const r = await call("GET", "/api/admin/agencies/agency-a", "admin-1");
    expect(r.status).toBe(200);
    const a = AdminAgencyResponse.parse(r.body);
    expect(a.name).toBe("Sunrise Health Staffing");
    expect(a.members.map((m) => [m.userId, m.role]).sort()).toEqual([["agency-a", "owner"], ["mgr-a", "manager"], ["viewer-a", "viewer"]]);
    expect(a.shiftCounts).toEqual({ open: 1, filled: 1, cancelled: 0, completed: 0 });
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|password/i);
    errorIs(await call("GET", "/api/admin/agencies/agency-c", "admin-1"), 404, "Not found");
    errorIs(await call("GET", "/api/admin/agencies/nope", "admin-1"), 404, "Not found");
    errorIs(await call("GET", "/api/admin/agencies/agency-a", "agency-a"), 403, "Forbidden");
  });
});

describe("PATCH /api/credentials/:id/review", () => {
  const review = (id: string, who: string | undefined, body: unknown) => call("PATCH", `/api/credentials/${id}/review`, who, { body });

  it("401 anonymous; 403 nurse (even the owner) and agency; 400 on a bad status; 404 foreign / unknown", async () => {
    expect((await review("cred-tb-1", undefined, { status: "verified" })).status).toBe(401);
    for (const who of ["nurse-1", "agency-a", "viewer-a"]) errorIs(await review("cred-tb-1", who, { status: "verified" }), 403, "Forbidden");
    for (const body of [{}, { status: "pending" }, { status: "nope" }, { status: 1 }]) {
      errorIs(await review("cred-tb-1", "admin-1", body), 400, "Invalid status: use verified or rejected");
    }
    errorIs(await review("cred-n2", "admin-1", { status: "verified" }), 404, "Not found"); // other network
    errorIs(await review("cred-missing", "admin-1", { status: "verified" }), 404, "Not found");
    errorIs(await review("bad%20id", "admin-1", { status: "verified" }), 404, "Not found");
    expect((await t.db.select().from(credentials).where(eq(credentials.id, "cred-n2")))[0]!.status).toBe("pending"); // untouched
  });

  it("verifies a pending credential: updates status + reviewer, writes one audit row, returns the credential without keys", async () => {
    const r = await review("cred-tb-1", "admin-1", { status: "verified" });
    expect(r.status).toBe(200);
    const { credential } = ReviewCredentialResponse.parse(r.body);
    expect(credential).toMatchObject({ id: "cred-tb-1", status: "verified", type: "tb_screening", hasFile: true });
    expect(r.raw).not.toContain(SECRET_KEY);
    const [row] = await t.db.select().from(credentials).where(eq(credentials.id, "cred-tb-1"));
    expect(row).toMatchObject({ status: "verified", reviewedBy: "admin-1" });
    expect(row!.reviewedAt).toBeInstanceOf(Date);
    const audit = await t.db.select().from(auditLog).where(and(eq(auditLog.entityType, "credential"), eq(auditLog.entityId, "cred-tb-1"), eq(auditLog.action, "credential.reviewed")));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorUserId: "admin-1", actorRole: "admin", networkId: "network-default", agencyId: null });
    expect(audit[0]!.changes).toEqual({ status: ["pending", "verified"], nurseId: "nurse-1" });
    // E6: exactly one mail, to the credential's nurse, outcome only (no type, no file)
    const mail = await t.db.select().from(notifications).where(eq(notifications.template, "credential.reviewed"));
    expect(mail.map((n) => [n.recipientEmail, n.payload])).toEqual([["maria.lopez@example.com", { outcome: "verified" }]]);
  });

  it("409 when the credential already has that status; a verified one can still be rejected (and the audit shows both steps)", async () => {
    errorIs(await review("cred-tb-1", "admin-1", { status: "verified" }), 409, "Credential already has this status");
    const r = await review("cred-tb-1", "admin-1", { status: "rejected" });
    expect(ReviewCredentialResponse.parse(r.body).credential.status).toBe("rejected");
    const audit = await t.db.select().from(auditLog).where(and(eq(auditLog.entityId, "cred-tb-1"), eq(auditLog.action, "credential.reviewed")));
    expect(audit.map((a) => a.changes)).toEqual(expect.arrayContaining([{ status: ["verified", "rejected"], nurseId: "nurse-1" }]));
    expect(audit).toHaveLength(2);
    const mail = await t.db.select().from(notifications).where(eq(notifications.template, "credential.reviewed")); // the 409 added nothing
    expect(mail.map((n) => n.payload).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual([{ outcome: "rejected" }, { outcome: "verified" }]);
  });

  it("does not change the eligibility rule: rejecting the only license makes the claim 403, verifying it again restores the claim", async () => {
    // nurse-2's license is expired (spec); use nurse-pct instead: give her a pending license, then drive the claim of an open shift.
    // nurse-pct is LPN, so the shift must be LPN too (claim also enforces license type vs role).
    await t.db.insert(credentials).values({ id: "cred-pct", nurseId: "nurse-pct", type: "license", expiresOn: "2099-01-01", status: "pending" });
    await t.db.insert(shifts).values({ id: "shift-920", networkId: "network-default", agencyId: "agency-a", role: "LPN", shiftDate: "2098-06-01", startTime: "07:00", endTime: "19:00", timezone: "America/New_York", status: "open", createdBy: "admin-1" });
    const claim = (id: string) => app.inject({ method: "POST", url: `/api/shifts/${id}/claim`, headers: { authorization: `Bearer ${tokenOf.pct}` } });
    const tokenOf = { pct: await signAccessToken({ id: "nurse-pct", role: "nurse" }) };
    expect((await review("cred-pct", "admin-1", { status: "rejected" })).status).toBe(200);
    const denied = await claim("shift-920");
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({ error: "No valid credential on file, cannot claim shift" });
    expect((await review("cred-pct", "admin-1", { status: "verified" })).status).toBe(200);
    const ok = await claim("shift-920");
    expect(ok.statusCode).toBe(200);
  });
});
