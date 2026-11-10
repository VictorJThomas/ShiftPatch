// Scoped inspection package (ESCALATION.md, Option D). Routes authorize with can("inspection:use") first; scope per nurse / per package is here.
// Privacy: no query here selects an object key or file name except `documentLink`, which signs and forgets. Nothing is logged.
import { randomUUID } from "node:crypto";
import {
  type CreateInspectionPackageRequest, INSPECTION_TTL_HOURS, type InspectionCandidate, type InspectionDocument, type InspectionLicenseStatus,
  type InspectionNurseSummary, type InspectionPackage, InspectionMessage,
} from "@shiftpatch/contracts";
import { and, between, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../../db/client.js";
import { credentials, files, inspectionPackages, nurseProfiles, shifts, userProfiles, users } from "../../db/schema/index.js";
import type { ObjectStorage } from "../../lib/storage.js";
import { type RequestMeta, recordAudit, type Tx } from "../audit/audit.js";
import type { Actor } from "../authz/actor.js";
import { can } from "../authz/can.js";
import type { Decision } from "../authz/decision.js";
import { DOWNLOAD_TTL_SECONDS } from "../credentials/service.js";

type PkgRow = typeof inspectionPackages.$inferSelect;
type Fail = { ok: false; fail: { status: 400 | 404 | 410; error: string } };
type Denied = { ok: false; denied: Decision & { allow: false } };
const notFound: Fail = { ok: false, fail: { status: 404, error: InspectionMessage.notFound } };
const gone: Fail = { ok: false, fail: { status: 410, error: InspectionMessage.expired } };
const forbidden: Denied = { ok: false, denied: { allow: false, reason: "role_not_permitted" } }; // -> 403 Forbidden

const iso = (d: Date) => d.toISOString();
const today = (now: Date) => now.toISOString().slice(0, 10);

/** Where audit rows for an actor's work on a package land: the package's own network and agency, so GET /api/audit-logs scopes them. */
const auditBase = (actor: Actor, meta: RequestMeta, pkg: Pick<PkgRow, "id" | "networkId" | "agencyId">) => ({
  ...meta, actorUserId: actor.userId, actorRole: actor.role, networkId: pkg.networkId, agencyId: pkg.agencyId,
  entityType: "inspection_package", entityId: pkg.id,
});

// ---------- scope ----------

interface ScopedNurse { id: string; name: string; email: string; networkId: string }

/**
 * Nurses the actor may put in a package. Admin: nurses of their networks. Agency owner: nurses who held a filled or completed shift
 * of the ACTIVE agency dated inside the period. `ids` narrows the lookup (the generate path); the caller compares counts.
 */
async function scopedNurses(db: Db | Tx, actor: Actor, period: { from: string; to: string }, ids?: readonly string[]): Promise<ScopedNurse[]> {
  const base = db
    .select({ id: nurseProfiles.userId, name: userProfiles.fullName, email: users.email, networkId: nurseProfiles.networkId })
    .from(nurseProfiles)
    .innerJoin(users, eq(users.id, nurseProfiles.userId))
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id));
  const idFilter = ids ? inArray(nurseProfiles.userId, [...ids]) : undefined;
  if (actor.role === "admin") {
    if (actor.networkIds.length === 0) return [];
    return base.where(and(inArray(nurseProfiles.networkId, [...actor.networkIds]), isNull(users.deletedAt), idFilter)).orderBy(userProfiles.fullName, nurseProfiles.userId);
  }
  if (actor.activeAgencyId === null) return [];
  const worked = db
    .selectDistinct({ nurseId: shifts.claimedBy })
    .from(shifts)
    .where(and(
      eq(shifts.agencyId, actor.activeAgencyId), inArray(shifts.status, ["filled", "completed"]), isNotNull(shifts.claimedBy),
      isNull(shifts.deletedAt), between(shifts.shiftDate, period.from, period.to),
    ));
  return base.where(and(inArray(nurseProfiles.userId, worked), isNull(users.deletedAt), idFilter)).orderBy(userProfiles.fullName, nurseProfiles.userId);
}

/** valid = verified and unexpired; else pending unexpired; else expired; else rejected; else none. */
export function licenseStatus(rows: readonly { status: "pending" | "verified" | "rejected"; expiresOn: string | null }[], todayIso: string): InspectionLicenseStatus {
  if (rows.length === 0) return "none";
  const live = rows.filter((r) => r.status !== "rejected" && (r.expiresOn === null || r.expiresOn >= todayIso));
  if (live.some((r) => r.status === "verified")) return "verified";
  if (live.length > 0) return "pending";
  return rows.some((r) => r.status !== "rejected") ? "expired" : "rejected";
}

/** GET /api/inspection/nurses?from&to */
export async function candidates(db: Db, actor: Actor, period: { from: string; to: string }, now = new Date()): Promise<InspectionCandidate[]> {
  const nurses = await scopedNurses(db, actor, period);
  if (nurses.length === 0) return [];
  const lic = await db
    .select({ nurseId: credentials.nurseId, status: credentials.status, expiresOn: credentials.expiresOn })
    .from(credentials)
    .where(and(inArray(credentials.nurseId, nurses.map((n) => n.id)), eq(credentials.type, "license"), isNull(credentials.deletedAt)));
  return nurses.map((n) => ({ id: n.id, name: n.name, licenseStatus: licenseStatus(lic.filter((l) => l.nurseId === n.id), today(now)) }));
}

// ---------- packages ----------

const toPackage = (p: PkgRow, createdByName: string, now: Date): InspectionPackage => ({
  id: p.id, createdByName, createdAt: iso(p.createdAt), expiresAt: iso(p.expiresAt), revoked: p.revokedAt !== null, expired: p.expiresAt <= now,
  nurseCount: p.nurseIds.length, from: p.periodFrom, to: p.periodTo, includeDocuments: p.includeDocuments, includeTbDocuments: p.includeTbDocuments,
});

const withCreator = (db: Db | Tx) =>
  db.select({ pkg: inspectionPackages, createdByName: userProfiles.fullName }).from(inspectionPackages).innerJoin(userProfiles, eq(userProfiles.userId, inspectionPackages.createdBy));

/** POST /api/inspection-packages. Any nurse outside the actor's scope -> 403 (and which one is never said). Row + audit in one tx. */
export async function generate(db: Db, actor: Actor, input: Omit<CreateInspectionPackageRequest, "includeDocuments" | "includeTbDocuments"> & { includeDocuments: boolean; includeTbDocuments: boolean }, meta: RequestMeta, now = new Date()) {
  const nurses = await scopedNurses(db, actor, input, input.nurseIds);
  if (nurses.length !== input.nurseIds.length) {
    await recordAudit(db, { // the attempt is logged with counts only: no ids that exist, no names
      ...meta, actorUserId: actor.userId, actorRole: actor.role, networkId: actor.role === "admin" ? (actor.networkIds[0] ?? null) : null, agencyId: actor.activeAgencyId,
      action: "access.denied", entityType: "inspection_package", entityId: "new", changes: { reason: "out_of_scope", requested: input.nurseIds.length },
    });
    return forbidden;
  }
  const networks = new Set(nurses.map((n) => n.networkId));
  if (networks.size !== 1) return { ok: false, fail: { status: 400, error: InspectionMessage.singleNetwork } } as Fail;
  const networkId = [...networks][0]!;
  const agencyId = actor.role === "agency" ? actor.activeAgencyId : null;
  const id = `insp_${randomUUID()}`;
  const expiresAt = new Date(now.getTime() + INSPECTION_TTL_HOURS * 3_600_000);
  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(inspectionPackages).values({
      id, networkId, agencyId, createdBy: actor.userId, nurseIds: [...input.nurseIds], periodFrom: input.from, periodTo: input.to,
      includeDocuments: input.includeDocuments, includeTbDocuments: input.includeTbDocuments, expiresAt, createdAt: now,
    }).returning();
    await recordAudit(tx, {
      ...auditBase(actor, meta, { id, networkId, agencyId }), action: "inspection_package.generated",
      changes: { nurseCount: input.nurseIds.length, nurseIds: input.nurseIds, from: input.from, to: input.to, includeDocuments: input.includeDocuments, includeTbDocuments: input.includeTbDocuments },
    });
    return inserted!;
  });
  const [me] = await db.select({ name: userProfiles.fullName }).from(userProfiles).where(eq(userProfiles.userId, actor.userId));
  return { ok: true, value: toPackage(row, me?.name ?? "Unknown", now) } as const;
}

/** GET /api/inspection-packages: packages in the actor's scope, newest first (max 100). */
export async function list(db: Db, actor: Actor, now = new Date()): Promise<InspectionPackage[]> {
  const scope = actor.role === "admin"
    ? (actor.networkIds.length > 0 ? inArray(inspectionPackages.networkId, [...actor.networkIds]) : sql`false`)
    : eq(inspectionPackages.agencyId, actor.activeAgencyId ?? "");
  const rows = await withCreator(db).where(scope).orderBy(desc(inspectionPackages.createdAt), desc(inspectionPackages.id)).limit(100);
  return rows.map((r) => toPackage(r.pkg, r.createdByName, now));
}

type Loaded = { pkg: PkgRow; createdByName: string };
async function load(db: Db | Tx, id: string): Promise<Loaded | null> {
  const [r] = await withCreator(db).where(eq(inspectionPackages.id, id));
  return r ? { pkg: r.pkg, createdByName: r.createdByName } : null;
}
const unusable = (p: PkgRow, now: Date) => p.revokedAt !== null || p.expiresAt <= now;

/** GET /api/inspection-packages/:id. Out of scope or unknown -> 404 (an access.denied row for the first); expired / revoked -> 410. Audited as viewed. */
export async function view(db: Db, actor: Actor, id: string, meta: RequestMeta, now = new Date()) {
  const loaded = await load(db, id);
  if (!loaded) return notFound;
  const { pkg } = loaded;
  if (!can(actor, "inspection:read", { networkId: pkg.networkId, agencyId: pkg.agencyId }).allow) {
    await recordAudit(db, { ...meta, actorUserId: actor.userId, actorRole: actor.role, networkId: pkg.networkId, agencyId: actor.activeAgencyId, action: "access.denied", entityType: "inspection_package", entityId: id, changes: { reason: "out_of_scope" } });
    return notFound;
  }
  if (unusable(pkg, now)) return gone;
  await recordAudit(db, { ...auditBase(actor, meta, pkg), action: "inspection_package.viewed", changes: { nurseCount: pkg.nurseIds.length } });

  const verifier = alias(userProfiles, "verifier");
  const [people, creds] = await Promise.all([
    db.select({ id: nurseProfiles.userId, name: userProfiles.fullName, email: users.email })
      .from(nurseProfiles).innerJoin(users, eq(users.id, nurseProfiles.userId)).innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(inArray(nurseProfiles.userId, pkg.nurseIds)).orderBy(userProfiles.fullName, nurseProfiles.userId),
    db.select({
      id: credentials.id, nurseId: credentials.nurseId, type: credentials.type, licenseType: credentials.licenseType, number: credentials.number,
      issuingState: credentials.issuingState, expiresOn: credentials.expiresOn, screenedOn: credentials.screenedOn, status: credentials.status,
      reviewedAt: credentials.reviewedAt, verifiedByName: verifier.fullName, hasFile: isNotNull(credentials.fileId),
    })
      .from(credentials).leftJoin(verifier, eq(verifier.userId, credentials.reviewedBy))
      .where(and(inArray(credentials.nurseId, pkg.nurseIds), inArray(credentials.type, ["license", "tb_screening"]), isNull(credentials.deletedAt)))
      .orderBy(desc(credentials.screenedOn), desc(credentials.expiresOn), credentials.id),
  ]);

  const nurses: InspectionNurseSummary[] = people.map((p) => {
    const mine = creds.filter((c) => c.nurseId === p.id);
    const tb = mine.find((c) => c.type === "tb_screening" && c.status !== "rejected"); // newest first
    return {
      nurseId: p.id, name: p.name, email: p.email,
      licenses: mine.filter((c) => c.type === "license").map((c) => ({
        licenseType: (c.licenseType as "RN" | "LPN" | "CNA" | null) ?? null, number: c.number, issuingState: c.issuingState, expiresOn: c.expiresOn, status: c.status,
        verifiedByName: c.status === "verified" ? c.verifiedByName : null, verifiedAt: c.status === "verified" && c.reviewedAt ? iso(c.reviewedAt) : null,
      })),
      tb: { onFile: tb !== undefined, screenedOn: tb?.screenedOn ?? null, status: tb?.status ?? null },
    };
  });
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const documents: InspectionDocument[] = creds
    .filter((c) => c.hasFile && ((pkg.includeDocuments && c.type === "license") || (pkg.includeTbDocuments && c.type === "tb_screening")))
    .map((c) => ({ credentialId: c.id, nurseId: c.nurseId, nurseName: nameOf.get(c.nurseId) ?? "Unknown", type: c.type as "license" | "tb_screening" }));
  return { ok: true, value: { package: toPackage(pkg, loaded.createdByName, now), nurses, documents } } as const;
}

/**
 * POST /api/inspection-packages/:id/documents/:credentialId/link. The credential must belong to a package nurse and its type must be
 * allowed by the package flags, else 404. Audited BEFORE signing: no audit row, no link. The URL is returned and never stored or logged.
 */
export async function documentLink(db: Db, storage: ObjectStorage, actor: Actor, id: string, credentialId: string, meta: RequestMeta, now = new Date()) {
  const loaded = await load(db, id);
  if (!loaded || !can(actor, "inspection:read", { networkId: loaded.pkg.networkId, agencyId: loaded.pkg.agencyId }).allow) return notFound;
  const { pkg } = loaded;
  if (unusable(pkg, now)) return gone;
  const types = [pkg.includeDocuments ? "license" : null, pkg.includeTbDocuments ? "tb_screening" : null].filter((t): t is "license" | "tb_screening" => t !== null);
  if (types.length === 0) return notFound;
  const [row] = await db
    .select({ nurseId: credentials.nurseId, objectKey: files.objectKey })
    .from(credentials).innerJoin(files, eq(files.id, credentials.fileId))
    .where(and(eq(credentials.id, credentialId), inArray(credentials.nurseId, pkg.nurseIds), inArray(credentials.type, types), isNull(credentials.deletedAt)));
  if (!row) return notFound;
  await recordAudit(db, { ...auditBase(actor, meta, pkg), action: "inspection_package.document_downloaded", changes: { credentialId, nurseId: row.nurseId } });
  const url = await storage.signedGetUrl(row.objectKey, DOWNLOAD_TTL_SECONDS);
  return { ok: true, value: { url, expiresAt: iso(new Date(now.getTime() + DOWNLOAD_TTL_SECONDS * 1000)) } } as const;
}

/** POST /api/inspection-packages/:id/revoke. Creator or a network admin. Already revoked -> 410. Row + audit in one tx. */
export async function revoke(db: Db, actor: Actor, id: string, meta: RequestMeta, now = new Date()) {
  const loaded = await load(db, id);
  if (!loaded) return notFound;
  const { pkg } = loaded;
  const decision = can(actor, "inspection:revoke", { networkId: pkg.networkId, agencyId: pkg.agencyId, createdBy: pkg.createdBy });
  if (!decision.allow) return decision.reason === "out_of_scope" ? notFound : ({ ok: false, denied: decision } as Denied);
  if (pkg.revokedAt !== null) return gone;
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(inspectionPackages).set({ revokedAt: now }).where(and(eq(inspectionPackages.id, id), isNull(inspectionPackages.revokedAt))).returning();
    if (!row) return null; // lost a race with another revoke
    await recordAudit(tx, { ...auditBase(actor, meta, pkg), action: "inspection_package.revoked", changes: { expired: pkg.expiresAt <= now } });
    return row;
  });
  if (!updated) return gone;
  return { ok: true, value: toPackage(updated, loaded.createdByName, now) } as const;
}

