// Role x endpoint authorization matrix (ARCHITECTURE §7, §13, §14) against a real throwaway Postgres.
// One table, every actor kind against every protected endpoint, with the exact status AND error body per cell.
// Expectations come from the policies (modules/*/policy.ts, authz/decision.ts), not from observed output.
// Write cells run on a fresh shift each, so no cell depends on another's state.
import { type AuditLogEntry, ErrorMessage } from "@shiftpatch/contracts";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import {
  agencies, agencyMemberships, auditLog, credentials, hospitalNetworks, networkAgencies, networkMemberships, nurseProfiles, shifts, userProfiles, users,
} from "../../db/schema/index.js";
import { seed } from "../../db/seed.js";
import { createTestDb } from "../../db/test-db.js";
import { signAccessToken } from "../auth/tokens.js";

type Role = "agency" | "nurse" | "admin";
let t: Awaited<ReturnType<typeof createTestDb>>;
let app: FastifyInstance;
const roles = new Map<string, Role>([["agency-a", "agency"], ["agency-b", "agency"], ["nurse-1", "nurse"], ["nurse-2", "nurse"], ["admin-1", "admin"]]);

async function makeUser(id: string, role: Role, status: "active" | "suspended" = "active") {
  await t.db.insert(users).values({ id, email: `${id}@example.com`, role, passwordHash: "x", status });
  await t.db.insert(userProfiles).values({ userId: id, fullName: id });
  roles.set(id, role);
}
const member = (userId: string, agencyId: string, role: "owner" | "manager" | "viewer") =>
  t.db.insert(agencyMemberships).values({ id: `agm_${userId}_${agencyId}`, userId, agencyId, role });

beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db);
  process.env.DATABASE_URL = t.url;
  // A second, isolated network with its own agency and admin.
  await t.db.insert(hospitalNetworks).values({ id: "network-2", name: "Second Network" });
  await t.db.insert(agencies).values({ id: "agency-c", name: "Gulf Staffing" });
  await t.db.insert(networkAgencies).values({ networkId: "network-2", agencyId: "agency-c" });
  await makeUser("owner-c", "agency"); await member("owner-c", "agency-c", "owner");
  // agency-a membership roles (seed's agency-a user is the owner).
  await makeUser("mgr-a", "agency"); await member("mgr-a", "agency-a", "manager");
  await makeUser("viewer-a", "agency"); await member("viewer-a", "agency-a", "viewer");
  await makeUser("revoked-a", "agency"); await member("revoked-a", "agency-a", "owner");
  await t.db.update(agencyMemberships).set({ revokedAt: new Date(), revokedBy: "admin-1" }).where(eq(agencyMemberships.id, "agm_revoked-a_agency-a"));
  // Suspended users keep a valid-looking token and their memberships/credentials: only the status should stop them.
  await makeUser("susp-a", "agency", "suspended"); await member("susp-a", "agency-a", "owner");
  await makeUser("susp-n", "nurse", "suspended");
  await t.db.insert(nurseProfiles).values({ userId: "susp-n", networkId: "network-default" });
  await t.db.insert(credentials).values({ id: "cred-susp-n", nurseId: "susp-n", type: "license", expiresOn: "2099-12-31", status: "verified", reviewedBy: "admin-1", reviewedAt: new Date() });
  // Admins: seed admin-1 administers network-default. admin-2 only network-2. admin-none has the role but no network.
  await makeUser("admin-2", "admin");
  await t.db.insert(networkMemberships).values({ id: "nwm-admin-2", userId: "admin-2", networkId: "network-2" });
  await makeUser("admin-none", "admin");
  app = buildApp();
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await t?.drop();
});

let seq = 0;
/** Fresh shift for one write cell. `filled` = claimed by nurse-1 (network-default) unless another nurse is named. */
async function mkShift(o: { agencyId?: string; networkId?: string; filled?: boolean } = {}) {
  const id = `shift-${9000 + ++seq}`;
  await t.db.insert(shifts).values({
    id, networkId: o.networkId ?? "network-default", agencyId: o.agencyId ?? "agency-a", role: "RN", shiftDate: "2026-10-10" /* inside nurse-1's seeded license (2027-01-01), after nurse-2's (2026-06-01) */, startTime: "07:00", endTime: "19:00",
    timezone: "America/New_York", status: o.filled ? "filled" : "open", createdBy: "admin-1",
    ...(o.filled ? { claimedBy: "nurse-1", claimedAt: new Date() } : {}),
  });
  return id;
}

let ip = 0;
async function call(method: "GET" | "POST", url: string, who: string | null, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { ...headers };
  if (who) h.authorization = `Bearer ${await signAccessToken({ id: who, role: roles.get(who)! })}`;
  const res = await app.inject({ method, url, headers: h, remoteAddress: `10.9.${Math.floor(++ip / 250)}.${ip % 250}`, ...(body === undefined ? {} : { payload: body as object }) });
  return { status: res.statusCode, body: res.json() as Record<string, unknown> };
}

// Exact bodies per outcome.
const UNAUTH = { error: ErrorMessage.unauthorized };
const FORBID = { error: ErrorMessage.forbidden };
const OK = null; // success: status only (shapes are asserted by the contract tests)

type Cell = [actor: string, status: number, body: Record<string, unknown> | null];
const expectCell = (r: { status: number; body: Record<string, unknown> }, status: number, body: Record<string, unknown> | null) => {
  expect(r.status).toBe(status);
  if (body) expect(r.body).toEqual(body);
};

const ACTORS_NOTE = "owner=agency-a, manager=mgr-a, viewer=viewer-a, other-agency=agency-b, nurse=nurse-1, admin=admin-1 (network-default), admin-other=admin-2 (network-2), admin-none, revoked-a, susp-a/susp-n (suspended)";

describe(`authorization matrix (${ACTORS_NOTE})`, () => {
  describe("GET /api/shifts (marketplace: any authenticated, active user)", () => {
    it.each<Cell>([
      ["agency-a", 200, OK], ["mgr-a", 200, OK], ["viewer-a", 200, OK], ["agency-b", 200, OK], ["nurse-1", 200, OK], ["nurse-2", 200, OK],
      ["admin-1", 200, OK], ["admin-2", 200, OK], ["admin-none", 200, OK],
      ["revoked-a", 200, OK], // still an authenticated user; the marketplace carries no agency-private data
      ["susp-a", 401, UNAUTH], ["susp-n", 401, UNAUTH], [null as unknown as string, 401, UNAUTH],
    ])("%s -> %i", async (who, status, body) => expectCell(await call("GET", "/api/shifts", who), status, body));
  });

  describe("GET /api/agencies/agency-a/shifts (members of agency-a, or admin of its network)", () => {
    it.each<Cell>([
      ["agency-a", 200, OK], ["mgr-a", 200, OK], ["viewer-a", 200, OK],
      ["agency-b", 403, FORBID], ["owner-c", 403, FORBID], ["nurse-1", 403, FORBID],
      ["admin-1", 200, OK], ["admin-2", 403, FORBID], ["admin-none", 403, FORBID],
      ["revoked-a", 403, FORBID], ["susp-a", 401, UNAUTH], [null as unknown as string, 401, UNAUTH],
    ])("%s -> %i", async (who, status, body) => expectCell(await call("GET", "/api/agencies/agency-a/shifts", who), status, body));

    it("cross-network: admin-2 reads agency-c (its network) but admin-1 cannot; agency-a owner cannot", async () => {
      expectCell(await call("GET", "/api/agencies/agency-c/shifts", "admin-2"), 200, OK);
      expectCell(await call("GET", "/api/agencies/agency-c/shifts", "admin-1"), 403, FORBID);
      expectCell(await call("GET", "/api/agencies/agency-c/shifts", "agency-a"), 403, FORBID);
    });

    it("IDOR: a list only ever contains the requested agency's rows", async () => {
      const r = await call("GET", "/api/agencies/agency-a/shifts", "agency-a");
      const list = r.body.shifts as Array<{ agencyId: string }>;
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list.map((s) => s.agencyId))).toEqual(new Set(["agency-a"]));
    });
  });

  describe("POST /api/shifts (owner/manager of the active agency)", () => {
    const body = { role: "RN", date: "2099-04-01", startTime: "07:00", endTime: "19:00" };
    it.each<Cell>([
      ["agency-a", 201, OK], ["mgr-a", 201, OK], ["viewer-a", 403, FORBID],
      ["nurse-1", 403, FORBID], ["admin-1", 403, FORBID], ["admin-none", 403, FORBID],
      ["revoked-a", 403, FORBID], ["susp-a", 401, UNAUTH], [null as unknown as string, 401, UNAUTH],
    ])("%s -> %i", async (who, status, b) => expectCell(await call("POST", "/api/shifts", who, body), status, b));

    it("the created shift belongs to the caller's agency even when the body names another one", async () => {
      const r = await call("POST", "/api/shifts", "agency-b", { ...body, agencyId: "agency-a", networkId: "network-2", status: "filled", claimedBy: "nurse-1" });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ agencyId: "agency-b", status: "open", claimedBy: null });
    });
  });

  describe("POST /api/shifts/:id/claim (nurse of the shift's network, valid credential)", () => {
    it.each<Cell>([
      ["nurse-1", 200, OK],
      ["nurse-2", 403, { error: ErrorMessage.credentialExpired }],
      ["agency-a", 403, FORBID], ["mgr-a", 403, FORBID], ["viewer-a", 403, FORBID],
      ["admin-1", 403, FORBID], ["admin-none", 403, FORBID], ["revoked-a", 403, FORBID],
      ["susp-n", 401, UNAUTH], [null as unknown as string, 401, UNAUTH],
    ])("%s -> %i", async (who, status, body) => {
      const id = await mkShift();
      expectCell(await call("POST", `/api/shifts/${id}/claim`, who), status, body);
      if (status !== 200) {
        const [row] = await t.db.select({ status: shifts.status, claimedBy: shifts.claimedBy }).from(shifts).where(eq(shifts.id, id));
        expect(row).toEqual({ status: "open", claimedBy: null }); // a denied claim writes nothing
      }
    });

    it("cross-network: a nurse claiming another network's shift gets 404 (existence hidden)", async () => {
      const id = await mkShift({ agencyId: "agency-c", networkId: "network-2" });
      expectCell(await call("POST", `/api/shifts/${id}/claim`, "nurse-1"), 404, { error: ErrorMessage.shiftNotFound });
    });

    it("IDOR: a body naming another nurse is ignored; the token's user is the claimant", async () => {
      const id = await mkShift();
      const r = await call("POST", `/api/shifts/${id}/claim`, "nurse-1", { claimedBy: "nurse-2", nurseId: "nurse-2" });
      expect(r.status).toBe(200);
      expect(r.body.claimedBy).toBe("nurse-1");
    });
  });

  describe("POST /api/shifts/:id/cancel (agency owner/manager, network admin, or the claiming nurse with advance)", () => {
    it.each<[...Cell, reason: "no-show" | "advance"]>([
      ["agency-a", 200, OK, "no-show"], ["mgr-a", 200, OK, "no-show"], ["viewer-a", 403, FORBID, "no-show"],
      ["agency-b", 403, FORBID, "no-show"], ["owner-c", 403, FORBID, "no-show"],
      ["admin-1", 200, OK, "no-show"], ["admin-2", 403, FORBID, "no-show"], ["admin-none", 403, FORBID, "no-show"],
      ["nurse-1", 200, OK, "advance"], ["nurse-1", 403, FORBID, "no-show"], // claimant: advance only
      ["nurse-2", 403, FORBID, "advance"], // not the claimant
      ["revoked-a", 403, FORBID, "no-show"], ["susp-a", 401, UNAUTH, "no-show"], [null as unknown as string, 401, UNAUTH, "advance"],
    ])("%s -> %i (%s)", async (who, status, body, reason) => {
      const id = await mkShift({ filled: true });
      expectCell(await call("POST", `/api/shifts/${id}/cancel`, who, { reason }), status, body);
      const [row] = await t.db.select({ status: shifts.status, claimedBy: shifts.claimedBy }).from(shifts).where(eq(shifts.id, id));
      expect(row).toEqual(status === 200 ? { status: "open", claimedBy: null } : { status: "filled", claimedBy: "nurse-1" });
    });
  });

  describe("POST /api/shifts/:id/withdraw (agency owner/manager or network admin; open shifts)", () => {
    // Withdraw hides the shift from non-members / foreign admins (404, service.withdrawShift); cancel answers 403 for the same
    // actors. Both are allowed by ARCHITECTURE §7 ("403 or 404"); recorded as a low-severity inconsistency, not changed here.
    const HIDDEN = { error: ErrorMessage.shiftNotFound };
    it.each<Cell>([
      ["agency-a", 200, OK], ["mgr-a", 200, OK], ["viewer-a", 403, FORBID], ["agency-b", 404, HIDDEN],
      ["admin-1", 200, OK], ["admin-2", 404, HIDDEN], ["admin-none", 404, HIDDEN],
      ["nurse-1", 403, FORBID], ["revoked-a", 404, HIDDEN], ["susp-a", 401, UNAUTH], [null as unknown as string, 401, UNAUTH],
    ])("%s -> %i", async (who, status, body) => {
      const id = await mkShift();
      expectCell(await call("POST", `/api/shifts/${id}/withdraw`, who), status, body);
    });
  });

  describe("GET /api/audit-logs (admin: own networks; agency owner/manager: own agency; others denied)", () => {
    it.each<Cell>([
      ["agency-a", 200, OK], ["mgr-a", 200, OK], ["viewer-a", 403, FORBID], ["agency-b", 200, OK],
      ["nurse-1", 403, FORBID], ["admin-1", 200, OK], ["admin-2", 200, OK], ["admin-none", 403, FORBID],
      ["revoked-a", 403, FORBID], ["susp-a", 401, UNAUTH], [null as unknown as string, 401, UNAUTH],
    ])("%s -> %i", async (who, status, body) => expectCell(await call("GET", "/api/audit-logs", who), status, body));

    it("scope comes from the actor: tampered agencyId/networkId query params never widen it", async () => {
      // Produce rows in both networks and both agencies.
      await call("POST", "/api/shifts", "agency-a", { role: "RN", date: "2099-05-01", startTime: "07:00", endTime: "19:00" });
      await call("POST", "/api/shifts", "agency-b", { role: "RN", date: "2099-05-01", startTime: "07:00", endTime: "19:00" });
      await call("POST", "/api/shifts", "owner-c", { role: "RN", date: "2099-05-01", startTime: "07:00", endTime: "19:00" });
      const rows = async (who: string, qs: string) => {
        const r = await call("GET", `/api/audit-logs?limit=100${qs}`, who);
        expect(r.status).toBe(200);
        return r.body.items as AuditLogEntry[];
      };
      const a = await rows("agency-a", "&agencyId=agency-b&networkId=network-2");
      expect(a.length).toBeGreaterThan(0);
      expect(a.every((e) => e.agencyId === "agency-a")).toBe(true);
      const n2 = await rows("admin-2", "&networkId=network-default&agencyId=agency-a");
      expect(n2.length).toBeGreaterThan(0);
      expect(n2.every((e) => e.networkId === "network-2")).toBe(true);
      const n1 = await rows("admin-1", "&networkId=network-2");
      expect(n1.some((e) => e.networkId === "network-2")).toBe(false);
      // Sanity: the rows exist in the table, so the filters above really excluded something.
      const all = await t.db.select({ networkId: auditLog.networkId }).from(auditLog);
      expect(all.some((r) => r.networkId === "network-2")).toBe(true);
    });
  });

  describe("X-Agency-Id manipulation (validated against DB memberships on every request)", () => {
    const AGENCY_NA = { error: ErrorMessage.agencyNotAllowed };
    it.each<[who: string, header: string, url: string, method: "GET" | "POST"]>([
      ["agency-a", "agency-b", "/api/shifts", "GET"], // foreign agency
      ["agency-a", "agency-c", "/api/agencies/agency-c/shifts", "GET"], // foreign network
      ["revoked-a", "agency-a", "/api/agencies/agency-a/shifts", "GET"], // revoked membership
      ["agency-a", "../agency-b", "/api/shifts", "GET"], // garbage
      ["nurse-1", "agency-a", "/api/shifts", "GET"], // non-agency role sending the header
      ["admin-1", "agency-a", "/api/shifts", "GET"],
      ["viewer-a", "agency-b", "/api/audit-logs", "GET"],
      ["agency-a", "agency-b", "/api/shifts", "POST"], // write in another agency's name
    ])("%s with X-Agency-Id=%s on %s %s -> 403 Agency not available", async (who, header, url, method) => {
      const body = method === "POST" ? { role: "RN", date: "2099-04-01", startTime: "07:00", endTime: "19:00" } : undefined;
      expectCell(await call(method, url, who, body, { "x-agency-id": header }), 403, AGENCY_NA);
    });
  });

  it("credential resources: only the nurse's own routes exist (review/download surfaces not implemented yet)", () => {
    expect(app.hasRoute({ method: "POST", url: "/api/nurses/me/credentials" })).toBe(true); // nurse-only, cells in credentials.test.ts
    expect(app.hasRoute({ method: "GET", url: "/api/nurses/me/credentials" })).toBe(true);
    for (const url of ["/api/credentials", "/api/files"]) {
      expect(app.hasRoute({ method: "POST", url })).toBe(false);
      expect(app.hasRoute({ method: "GET", url })).toBe(false);
    }
  });
});
