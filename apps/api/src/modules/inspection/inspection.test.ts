// Scoped inspection package (ESCALATION.md Option D) against a real throwaway Postgres, storage faked in memory. Synthetic data only.
import {
  CreateInspectionPackageRequest, InspectionDocumentLinkResponse, InspectionMessage, InspectionNursesResponse, InspectionPackageDetailResponse,
  InspectionPackageResponse, InspectionPackagesResponse,
} from "@shiftpatch/contracts";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import {
  agencyMemberships, auditLog, credentials, files, hospitalNetworks, inspectionPackages, networkMemberships, nurseProfiles, userProfiles, users,
} from "../../db/schema/index.js";
import { seed } from "../../db/seed.js";
import { createTestDb } from "../../db/test-db.js";
import type { ObjectStorage } from "../../lib/storage.js";
import { signAccessToken } from "../auth/tokens.js";
import { can } from "../authz/can.js";
import type { Actor } from "../authz/actor.js";
import { licenseStatus } from "./service.js";

type Role = "agency" | "nurse" | "admin";
const roles = new Map<string, Role>();
const KEYS = { lic1: "credentials/secret-key-lic-1", tb1: "credentials/secret-key-tb-1", lic2: "credentials/secret-key-lic-2", lic3: "credentials/secret-key-lic-3" };
const FILENAME = "Maria-Lopez-Personal-Scan.pdf";
const signed: string[] = [];
const storage: ObjectStorage = {
  putObject: async () => undefined,
  signedGetUrl: async (key, ttl) => { const u = `https://signed.example/${key}?X-Amz-Expires=${ttl}&X-Amz-Signature=sig`; signed.push(u); return u; },
  deleteObject: async () => undefined,
};

let t: Awaited<ReturnType<typeof createTestDb>>;
let app: FastifyInstance;
let logApp: FastifyInstance;
const logLines: string[] = [];
let ip = 0;

async function makeUser(id: string, role: Role, name = id) {
  await t.db.insert(users).values({ id, email: `${id}@example.com`, role, passwordHash: "x" });
  await t.db.insert(userProfiles).values({ userId: id, fullName: name });
  roles.set(id, role);
}
const agencyMember = (userId: string, agencyId: string, role: "owner" | "manager" | "viewer") =>
  t.db.insert(agencyMemberships).values({ id: `agm_${userId}_${agencyId}`, userId, agencyId, role });
const adminOf = async (id: string, networkId: string) => {
  await makeUser(id, "admin", id);
  await t.db.insert(networkMemberships).values({ id: `nwm-${id}`, userId: id, networkId });
};
const addFile = async (id: string, key: string) =>
  t.db.insert(files).values({ id, bucket: "private_credentials", objectKey: key, originalName: FILENAME, mimeType: "application/pdf", sizeBytes: 12, sha256: "a".repeat(64), uploadedBy: "admin-1" });

beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db);
  process.env.DATABASE_URL = t.url;
  for (const [id, r] of [["agency-a", "agency"], ["agency-b", "agency"], ["nurse-1", "nurse"], ["nurse-2", "nurse"], ["admin-1", "admin"]] as const) roles.set(id, r);
  // Roles inside agency-a (seed's agency-a user is the owner).
  await makeUser("mgr-a", "agency"); await agencyMember("mgr-a", "agency-a", "manager");
  await makeUser("viewer-a", "agency"); await agencyMember("viewer-a", "agency-a", "viewer");
  await adminOf("admin-3", "network-default");
  await adminOf("admin-4", "network-default");
  // Second network: its own admin, agency, nurse.
  await t.db.insert(hospitalNetworks).values({ id: "network-2", name: "Second Network" });
  await adminOf("admin-2", "network-2");
  await makeUser("nurse-3", "nurse", "Zed Outsider");
  await t.db.insert(nurseProfiles).values({ userId: "nurse-3", networkId: "network-2" });
  // Synthetic documents (no real file is ever stored; the fake storage keeps nothing).
  await addFile("file-lic-1", KEYS.lic1); await addFile("file-tb-1", KEYS.tb1); await addFile("file-lic-2", KEYS.lic2); await addFile("file-lic-3", KEYS.lic3);
  const reviewed = { status: "verified" as const, reviewedBy: "admin-1", reviewedAt: new Date("2026-01-02T00:00:00Z") };
  await t.db.insert(credentials).values([
    { id: "cred-doc-1", nurseId: "nurse-1", type: "license", licenseType: "RN", number: "RN-12345", issuingState: "FL", expiresOn: "2027-03-01", fileId: "file-lic-1", ...reviewed },
    { id: "cred-tb-1", nurseId: "nurse-1", type: "tb_screening", screenedOn: "2026-05-05", fileId: "file-tb-1", ...reviewed },
    { id: "cred-doc-2", nurseId: "nurse-2", type: "license", licenseType: "RN", expiresOn: "2026-12-31", fileId: "file-lic-2", ...reviewed },
    { id: "cred-doc-3", nurseId: "nurse-3", type: "license", licenseType: "RN", expiresOn: "2027-12-31", fileId: "file-lic-3", ...reviewed },
  ]);
  app = buildApp({ storage });
  await app.ready();
  logApp = buildApp({ storage, logger: { level: "trace", stream: { write: (m: string) => void logLines.push(m) } } });
  await logApp.ready();
});
afterAll(async () => {
  await app?.close();
  await logApp?.close();
  await t?.drop();
});

async function callOn(a: FastifyInstance, method: "GET" | "POST", url: string, who: string | null, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { ...headers };
  if (who) h.authorization = `Bearer ${await signAccessToken({ id: who, role: roles.get(who)! })}`;
  const res = await a.inject({ method, url, headers: h, remoteAddress: `10.7.${Math.floor(++ip / 250)}.${ip % 250}`, ...(body === undefined ? {} : { payload: body as object }) });
  return { status: res.statusCode, body: res.json() as Record<string, unknown>, text: res.body };
}
const call = (method: "GET" | "POST", url: string, who: string | null, body?: unknown) => callOn(app, method, url, who, body);
const PERIOD = { from: "2026-10-01", to: "2026-10-31" }; // nurse-1 worked shift-2 (agency-a, filled, 2026-10-03) inside it
const gen = (who: string, over: Record<string, unknown> = {}) =>
  call("POST", "/api/inspection-packages", who, { nurseIds: ["nurse-1", "nurse-2"], ...PERIOD, includeDocuments: false, includeTbDocuments: false, ...over });
const pkgId = (r: { body: Record<string, unknown> }) => (r.body.package as { id: string }).id;
const auditRows = (id: string) => t.db.select().from(auditLog).where(and(eq(auditLog.entityType, "inspection_package"), eq(auditLog.entityId, id))).orderBy(auditLog.id);

describe("policy (pure)", () => {
  const actor = (o: Partial<Actor> & { role: Actor["role"] }): Actor => ({ userId: "u", status: "active", agencies: [], networkIds: [], nurseNetworkId: null, activeAgencyId: null, ...o });
  const own = actor({ role: "agency", agencies: [{ agencyId: "a1", role: "owner" }], activeAgencyId: "a1" });
  const res = { networkId: "n1", agencyId: "a1" };
  it("use: admin with a network and agency owner only", () => {
    expect(can(actor({ role: "admin", networkIds: ["n1"] }), "inspection:use", {}).allow).toBe(true);
    expect(can(actor({ role: "admin" }), "inspection:use", {})).toEqual({ allow: false, reason: "not_a_member" });
    expect(can(own, "inspection:use", {}).allow).toBe(true);
    for (const role of ["manager", "viewer"] as const) expect(can(actor({ role: "agency", agencies: [{ agencyId: "a1", role }], activeAgencyId: "a1" }), "inspection:use", {})).toEqual({ allow: false, reason: "insufficient_membership_role" });
    expect(can(actor({ role: "nurse" }), "inspection:use", {})).toEqual({ allow: false, reason: "role_not_permitted" });
  });
  it("read / revoke scope", () => {
    expect(can(own, "inspection:read", res).allow).toBe(true);
    expect(can(own, "inspection:read", { networkId: "n1", agencyId: "a2" })).toEqual({ allow: false, reason: "out_of_scope" });
    expect(can(own, "inspection:read", { networkId: "n1", agencyId: null })).toEqual({ allow: false, reason: "out_of_scope" });
    expect(can(actor({ role: "admin", networkIds: ["n2"] }), "inspection:read", res)).toEqual({ allow: false, reason: "out_of_scope" });
    expect(can(actor({ role: "admin", networkIds: ["n1"] }), "inspection:revoke", { ...res, createdBy: "other" }).allow).toBe(true);
    expect(can({ ...own, userId: "me" }, "inspection:revoke", { ...res, createdBy: "me" }).allow).toBe(true);
    expect(can({ ...own, userId: "me" }, "inspection:revoke", { ...res, createdBy: "other" })).toEqual({ allow: false, reason: "resource_rule" });
  });
  it("licenseStatus summary", () => {
    expect(licenseStatus([], "2026-11-10")).toBe("none");
    expect(licenseStatus([{ status: "verified", expiresOn: "2027-01-01" }], "2026-11-10")).toBe("verified");
    expect(licenseStatus([{ status: "pending", expiresOn: "2027-01-01" }], "2026-11-10")).toBe("pending");
    expect(licenseStatus([{ status: "verified", expiresOn: "2026-01-01" }], "2026-11-10")).toBe("expired");
    expect(licenseStatus([{ status: "rejected", expiresOn: "2027-01-01" }], "2026-11-10")).toBe("rejected");
  });
});

describe("authorization", () => {
  it.each([["mgr-a", 403], ["viewer-a", 403], ["nurse-1", 403]])("%s -> %i on every route", async (who, status) => {
    expect((await call("GET", `/api/inspection/nurses?from=${PERIOD.from}&to=${PERIOD.to}`, who)).status).toBe(status);
    expect((await call("GET", "/api/inspection-packages", who)).status).toBe(status);
    expect((await gen(who)).status).toBe(status);
    expect((await call("GET", "/api/inspection-packages/x", who)).status).toBe(status);
    expect((await call("POST", "/api/inspection-packages/x/revoke", who)).status).toBe(status);
    expect((await call("POST", "/api/inspection-packages/x/documents/y/link", who)).status).toBe(status);
    expect((await call("GET", "/api/inspection-packages", who)).body).toEqual({ error: InspectionMessage.forbidden });
  });
  it("401 without a token", async () => expect((await call("GET", "/api/inspection-packages", null)).status).toBe(401));
});

describe("candidates", () => {
  it("admin: every nurse of the network (not other networks), with license status", async () => {
    const r = await call("GET", `/api/inspection/nurses?from=${PERIOD.from}&to=${PERIOD.to}`, "admin-1");
    expect(r.status).toBe(200);
    const { nurses } = InspectionNursesResponse.parse(r.body);
    expect(nurses.map((n) => n.id).sort()).toEqual(["nurse-1", "nurse-2"]);
    expect(nurses.find((n) => n.id === "nurse-1")!.licenseStatus).toBe("verified");
  });
  it("agency owner: only nurses with a filled/completed shift of the active agency inside the period", async () => {
    const inside = InspectionNursesResponse.parse((await call("GET", `/api/inspection/nurses?from=${PERIOD.from}&to=${PERIOD.to}`, "agency-a")).body);
    expect(inside.nurses.map((n) => n.id)).toEqual(["nurse-1"]);
    const outside = InspectionNursesResponse.parse((await call("GET", "/api/inspection/nurses?from=2026-11-01&to=2026-11-30", "agency-a")).body);
    expect(outside.nurses).toEqual([]);
    const other = InspectionNursesResponse.parse((await call("GET", `/api/inspection/nurses?from=${PERIOD.from}&to=${PERIOD.to}`, "agency-b")).body);
    expect(other.nurses).toEqual([]);
  });
  it("400 for a bad or too long period", async () => {
    expect((await call("GET", "/api/inspection/nurses?from=2026-01-01&to=2027-06-01", "admin-1")).body).toEqual({ error: InspectionMessage.invalidPeriod });
    expect((await call("GET", "/api/inspection/nurses?from=nope", "admin-1")).status).toBe(400);
  });
});

describe("generate / view (admin)", () => {
  let id: string;
  it("201: contract shape, 24 h expiry, audit row with ids and flags but no content", async () => {
    const r = await gen("admin-1", { includeDocuments: true });
    expect(r.status).toBe(201);
    const { package: p } = InspectionPackageResponse.parse(r.body);
    id = p.id;
    expect(p).toMatchObject({ nurseCount: 2, from: PERIOD.from, to: PERIOD.to, includeDocuments: true, includeTbDocuments: false, revoked: false, expired: false, createdByName: "Alex Kim" });
    const hours = (Date.parse(p.expiresAt) - Date.parse(p.createdAt)) / 3_600_000;
    expect(hours).toBeCloseTo(24, 3);
    const [row] = await t.db.select().from(inspectionPackages).where(eq(inspectionPackages.id, id));
    expect(row).toMatchObject({ networkId: "network-default", agencyId: null, createdBy: "admin-1" });
    const [audit] = await auditRows(id);
    expect(audit).toMatchObject({
      action: "inspection_package.generated", actorUserId: "admin-1", actorRole: "admin", networkId: "network-default",
      changes: { nurseCount: 2, nurseIds: ["nurse-1", "nurse-2"], from: PERIOD.from, to: PERIOD.to, includeDocuments: true, includeTbDocuments: false },
    });
    expect(JSON.stringify(audit)).not.toContain("secret-key");
  });
  it("GET: summary + license documents only (TB not opted in), no keys, no file names, no URLs, audited as viewed", async () => {
    const r = await call("GET", `/api/inspection-packages/${id}`, "admin-1");
    expect(r.status).toBe(200);
    const d = InspectionPackageDetailResponse.parse(r.body);
    const n1 = d.nurses.find((n) => n.nurseId === "nurse-1")!;
    expect(n1).toMatchObject({ name: "Maria Lopez", email: "maria.lopez@example.com", tb: { onFile: true, screenedOn: "2026-05-05", status: "verified" } });
    expect(n1.licenses).toContainEqual({ licenseType: "RN", number: "RN-12345", issuingState: "FL", expiresOn: "2027-03-01", status: "verified", verifiedByName: "Alex Kim", verifiedAt: "2026-01-02T00:00:00.000Z" });
    expect(d.nurses.find((n) => n.nurseId === "nurse-2")!.tb).toEqual({ onFile: false, screenedOn: null, status: null });
    expect(d.documents.map((x) => x.credentialId).sort()).toEqual(["cred-doc-1", "cred-doc-2"]);
    expect(d.documents.every((x) => x.type === "license")).toBe(true);
    expect(r.text).not.toMatch(/secret-key|credentials\/|Personal-Scan|\.pdf|https?:\/\/|objectKey|originalName/);
    const actions = (await auditRows(id)).map((a) => a.action);
    expect(actions).toEqual(["inspection_package.generated", "inspection_package.viewed"]);
  });
  it("list: shows the package in scope, not another network's", async () => {
    const mine = InspectionPackagesResponse.parse((await call("GET", "/api/inspection-packages", "admin-1")).body);
    expect(mine.packages.map((p) => p.id)).toContain(id);
    const theirs = InspectionPackagesResponse.parse((await call("GET", "/api/inspection-packages", "admin-2")).body);
    expect(theirs.packages.map((p) => p.id)).not.toContain(id);
  });
  it("other network: view and link and revoke are 404", async () => {
    expect((await call("GET", `/api/inspection-packages/${id}`, "admin-2")).body).toEqual({ error: InspectionMessage.notFound });
    expect((await call("POST", `/api/inspection-packages/${id}/documents/cred-doc-1/link`, "admin-2")).status).toBe(404);
    expect((await call("POST", `/api/inspection-packages/${id}/revoke`, "admin-2")).status).toBe(404);
    expect((await call("GET", `/api/inspection-packages/${id}`, "agency-a")).status).toBe(404); // an agency owner never sees an admin-made package
    expect((await call("GET", "/api/inspection-packages/does-not-exist", "admin-1")).status).toBe(404);
  });
  it("a nurse outside the admin's network -> 403 without saying which; nothing stored", async () => {
    const before = await t.db.select().from(inspectionPackages);
    const r = await gen("admin-1", { nurseIds: ["nurse-1", "nurse-3"] });
    expect(r).toMatchObject({ status: 403, body: { error: InspectionMessage.forbidden } });
    expect(r.text).not.toContain("nurse-3");
    expect(await t.db.select().from(inspectionPackages)).toHaveLength(before.length);
    const [denied] = await t.db.select().from(auditLog).where(and(eq(auditLog.action, "access.denied"), eq(auditLog.entityType, "inspection_package"), eq(auditLog.entityId, "new")));
    expect(denied!.changes).toEqual({ reason: "out_of_scope", requested: 2 });
  });
  it("400: TB documents without license documents, too long a period, duplicate ids, unknown key", async () => {
    expect((await gen("admin-3", { includeTbDocuments: true })).body).toEqual({ error: InspectionMessage.tbNeedsDocuments });
    expect((await gen("admin-3", { from: "2026-01-01", to: "2027-06-01" })).body).toEqual({ error: InspectionMessage.invalidPeriod });
    expect((await gen("admin-3", { nurseIds: ["nurse-1", "nurse-1"] })).status).toBe(400);
    expect((await gen("admin-3", { nurseIds: [] })).status).toBe(400);
    expect((await gen("admin-3", { agencyId: "agency-a" })).status).toBe(400); // strict
    expect(CreateInspectionPackageRequest.safeParse({ nurseIds: Array.from({ length: 201 }, (_, i) => `n${i}`), from: "2026-01-01", to: "2026-01-02" }).success).toBe(false);
    expect(CreateInspectionPackageRequest.safeParse({ nurseIds: ["a"], from: "2026-01-01", to: "2027-01-01" }).success).toBe(true); // 366 days inclusive
  });
  it("rate limit on generation", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await gen("admin-4")).status);
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe("documents (admin)", () => {
  let withTb: string;
  let noDocs: string;
  let licOnly: string;
  beforeAll(async () => {
    withTb = pkgId(await gen("admin-3", { nurseIds: ["nurse-1"], includeDocuments: true, includeTbDocuments: true }));
    noDocs = pkgId(await gen("admin-3", { nurseIds: ["nurse-1"] }));
    licOnly = pkgId(await gen("admin-3", { nurseIds: ["nurse-1"], includeDocuments: true }));
  });
  const link = (id: string, cred: string, who = "admin-3") => call("POST", `/api/inspection-packages/${id}/documents/${cred}/link`, who);

  it("license and TB links work when opted in; one downloaded audit row each, never holding the URL or key", async () => {
    signed.length = 0;
    for (const cred of ["cred-doc-1", "cred-tb-1"]) {
      const r = await link(withTb, cred);
      expect(r.status).toBe(200);
      const body = InspectionDocumentLinkResponse.parse(r.body);
      expect(body.url).toContain("X-Amz-Expires=300");
    }
    const detail = InspectionPackageDetailResponse.parse((await call("GET", `/api/inspection-packages/${withTb}`, "admin-3")).body);
    expect(detail.documents.map((d) => d.type).sort()).toEqual(["license", "tb_screening"]);
    const rows = (await auditRows(withTb)).filter((a) => a.action === "inspection_package.document_downloaded");
    expect(rows).toHaveLength(2);
    expect(rows.map((a) => (a.changes as { credentialId: string }).credentialId).sort()).toEqual(["cred-doc-1", "cred-tb-1"]);
    for (const row of rows) { const s = JSON.stringify(row); expect(s).not.toContain("secret-key"); expect(s).not.toContain("signed.example"); }
  });
  it("TB link refused unless includeTbDocuments; no links at all without includeDocuments", async () => {
    expect((await link(licOnly, "cred-tb-1")).status).toBe(404);
    expect((await link(licOnly, "cred-doc-1")).status).toBe(200);
    expect((await link(noDocs, "cred-doc-1")).status).toBe(404);
    const rows = (await auditRows(noDocs)).filter((a) => a.action === "inspection_package.document_downloaded");
    expect(rows).toHaveLength(0); // refused: nothing signed, nothing logged as downloaded
  });
  it("a credential outside the package (other nurse, other network, no file, unknown) -> 404", async () => {
    for (const cred of ["cred-doc-2", "cred-doc-3", "cred-nurse-1", "cred-nope"]) expect((await link(withTb, cred)).status).toBe(404);
  });
});

describe("agency owner", () => {
  let id: string;
  it("can generate within scope; the package belongs to the agency and the nurse's network", async () => {
    const r = await gen("agency-a", { nurseIds: ["nurse-1"], includeDocuments: true });
    expect(r.status).toBe(201);
    id = pkgId(r);
    const [row] = await t.db.select().from(inspectionPackages).where(eq(inspectionPackages.id, id));
    expect(row).toMatchObject({ agencyId: "agency-a", networkId: "network-default", createdBy: "agency-a" });
    const [a] = await auditRows(id);
    expect(a).toMatchObject({ action: "inspection_package.generated", agencyId: "agency-a", actorRole: "agency" });
  });
  it("nurse without a shift for the agency in the period -> 403; nurse-2 never worked for agency-a", async () => {
    expect((await gen("agency-a", { nurseIds: ["nurse-1", "nurse-2"] })).status).toBe(403);
    expect((await gen("agency-a", { nurseIds: ["nurse-1"], from: "2026-11-01", to: "2026-11-30" })).status).toBe(403);
    expect((await gen("agency-b", { nurseIds: ["nurse-1"] })).status).toBe(403);
  });
  it("views and lists its own package; the other agency and the manager cannot", async () => {
    expect((await call("GET", `/api/inspection-packages/${id}`, "agency-a")).status).toBe(200);
    expect(InspectionPackagesResponse.parse((await call("GET", "/api/inspection-packages", "agency-a")).body).packages.map((p) => p.id)).toContain(id);
    expect((await call("GET", `/api/inspection-packages/${id}`, "agency-b")).status).toBe(404);
    expect((await call("GET", `/api/inspection-packages/${id}`, "mgr-a")).status).toBe(403);
    expect((await call("POST", `/api/inspection-packages/${id}/revoke`, "agency-b")).status).toBe(404);
  });
  it("a network admin of the nurse's network can view and revoke it", async () => {
    expect((await call("GET", `/api/inspection-packages/${id}`, "admin-1")).status).toBe(200);
    const r = await call("POST", `/api/inspection-packages/${id}/revoke`, "admin-1");
    expect(r.status).toBe(200);
    expect((await call("GET", `/api/inspection-packages/${id}`, "agency-a")).status).toBe(410);
  });
});

describe("expiry and revoke", () => {
  it("expired -> 410 on view and link; revoking an expired package is allowed once, then 410", async () => {
    const id = pkgId(await gen("admin-3", { nurseIds: ["nurse-1"], includeDocuments: true }));
    expect((await call("GET", `/api/inspection-packages/${id}`, "admin-3")).status).toBe(200);
    await t.db.update(inspectionPackages).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(inspectionPackages.id, id));
    for (const r of [await call("GET", `/api/inspection-packages/${id}`, "admin-3"), await call("POST", `/api/inspection-packages/${id}/documents/cred-doc-1/link`, "admin-3")]) {
      expect(r).toMatchObject({ status: 410, body: { error: "Inspection package expired" } });
    }
    const list = InspectionPackagesResponse.parse((await call("GET", "/api/inspection-packages", "admin-3")).body);
    expect(list.packages.find((p) => p.id === id)).toMatchObject({ expired: true, revoked: false });
  });
  it("revoke: creator and admin; audited; then 410 everywhere; a second revoke is 410", async () => {
    const id = pkgId(await gen("admin-3", { nurseIds: ["nurse-1"], includeDocuments: true }));
    const r = await call("POST", `/api/inspection-packages/${id}/revoke`, "admin-3");
    expect(r.status).toBe(200);
    expect(InspectionPackageResponse.parse(r.body).package.revoked).toBe(true);
    expect((await call("GET", `/api/inspection-packages/${id}`, "admin-3")).status).toBe(410);
    expect((await call("POST", `/api/inspection-packages/${id}/documents/cred-doc-1/link`, "admin-3")).status).toBe(410);
    expect((await call("POST", `/api/inspection-packages/${id}/revoke`, "admin-3")).status).toBe(410);
    const [row] = await t.db.select().from(inspectionPackages).where(eq(inspectionPackages.id, id));
    expect(row!.revokedAt).not.toBeNull();
    const actions = (await auditRows(id)).map((a) => a.action);
    expect(actions.filter((a) => a === "inspection_package.revoked")).toHaveLength(1);
  });
  it("another admin of the same network (not the creator) may revoke; the agency list still shows it as revoked", async () => {
    const id = pkgId(await gen("agency-a", { nurseIds: ["nurse-1"] }));
    expect((await call("POST", `/api/inspection-packages/${id}/revoke`, "admin-4")).status).toBe(200);
    const list = InspectionPackagesResponse.parse((await call("GET", "/api/inspection-packages", "agency-a")).body);
    expect(list.packages.find((p) => p.id === id)!.revoked).toBe(true);
  });
});

describe("logs", () => {
  it("never contain signed URLs, object keys, file names or tokens across generate / view / link / revoke", async () => {
    logLines.length = 0;
    const g = await callOn(logApp, "POST", "/api/inspection-packages", "admin-1", { nurseIds: ["nurse-1"], ...PERIOD, includeDocuments: true, includeTbDocuments: true });
    const id = pkgId(g);
    await callOn(logApp, "GET", `/api/inspection-packages/${id}`, "admin-1");
    const l = await callOn(logApp, "POST", `/api/inspection-packages/${id}/documents/cred-doc-1/link`, "admin-1");
    const url = (l.body as { url: string }).url;
    await callOn(logApp, "POST", `/api/inspection-packages/${id}/revoke`, "admin-1");
    const out = logLines.join("");
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toContain(url);
    for (const s of ["X-Amz-Signature", "signed.example", "secret-key", FILENAME, "maria.lopez@example.com", "RN-12345"]) expect(out).not.toContain(s);
  });
});
