// Nurse credential uploads and the nurse's own credential list (ARCHITECTURE §9.2, §5.3). Callers authorize first.
import { createHash, randomUUID } from "node:crypto";
import { ErrorMessage, type CredentialType, type NurseCredential, type NurseDetail, type ShiftRole } from "@shiftpatch/contracts";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { credentials, files, nurseProfiles, shifts, userProfiles, users } from "../../db/schema/index.js";
import { type ObjectStorage, StorageError } from "../../lib/storage.js";
import { type RequestMeta, recordAudit } from "../audit/audit.js";
import type { Actor } from "../authz/actor.js";
import { can } from "../authz/can.js";
import type { Decision } from "../authz/decision.js";
import { enqueue } from "../notifications/enqueue.js";
import { networkAdmins, userName, userRecipient } from "../notifications/recipients.js";
import { isEligible, todayIn } from "../shifts/eligibility.js";
import { networkDefaultTimezone } from "../shifts/repository.js";
import { unassignAfterLicenseLoss } from "../shifts/unassign.js";

type Row = Pick<typeof credentials.$inferSelect, "id" | "type" | "licenseType" | "status" | "expiresOn" | "screenedOn" | "createdAt" | "fileId">;
const columns = {
  id: credentials.id, type: credentials.type, licenseType: credentials.licenseType, status: credentials.status,
  expiresOn: credentials.expiresOn, screenedOn: credentials.screenedOn, createdAt: credentials.createdAt, fileId: credentials.fileId,
};

const toNurseCredential = (r: Row, today: string): NurseCredential => ({
  id: r.id,
  type: r.type,
  licenseType: (r.licenseType as ShiftRole | null) ?? null, // DB CHECK limits it to RN/LPN/CNA
  status: r.status,
  expiresOn: r.expiresOn,
  screenedOn: r.screenedOn,
  uploadedAt: r.createdAt.toISOString(),
  expired: r.expiresOn !== null && r.expiresOn < today, // ISO dates compare lexically
  hasFile: r.fileId !== null,
});

/** "Today" for a nurse = the network's default timezone, the same facility-local notion the claim uses (no shift here). */
const nurseToday = async (db: Db, actor: Actor, now: Date) => todayIn(await networkDefaultTimezone(db, actor.nurseNetworkId ?? ""), now);

/** GET /api/nurses/me/credentials. `licenseValid` = the claim rule (§5.3) evaluated for a shift today. */
export async function listOwn(db: Db, actor: Actor, now = new Date()) {
  const [rows, today] = await Promise.all([
    db.select(columns).from(credentials)
      .where(and(eq(credentials.nurseId, actor.userId), isNull(credentials.deletedAt)))
      .orderBy(desc(credentials.createdAt), desc(credentials.id)),
    nurseToday(db, actor, now),
  ]);
  const licenseValid = isEligible(rows.filter((r) => r.type === "license"), { shiftDate: today }, today);
  return { credentials: rows.map((r) => toNurseCredential(r, today)), licenseValid };
}

const FILE_EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic" };

export interface UploadInput {
  type: CredentialType;
  licenseType?: ShiftRole;
  expiresOn?: string;
  screenedOn?: string;
  bytes: Buffer;
  mimeType: string; // sniffed, never the client's claim
  originalName: string | null;
}

/**
 * Upload -> one transaction (files + credentials pending + audit) -> on DB failure delete the object (compensate) and rethrow.
 * The object key is random (`credentials/<uuid>`): no name, email or other personal data.
 */
export async function upload(db: Db, storage: ObjectStorage, actor: Actor, input: UploadInput, meta: RequestMeta, onCompensateError: (err: unknown) => void, now = new Date()) {
  const today = await nurseToday(db, actor, now); // before the upload: nothing after the commit may trigger the compensating delete
  const objectKey = `credentials/${randomUUID()}`;
  // The download name comes from the sniffed type, never the original file name (personal data).
  const disposition = `attachment; filename="credential.${FILE_EXT[input.mimeType] ?? "bin"}"`;
  await storage.putObject(objectKey, input.bytes, input.mimeType, disposition).catch((cause: unknown) => {
    throw cause instanceof StorageError ? cause : new StorageError("PUT", null, { cause }); // e.g. fetch could not connect
  });
  try {
    const row = await db.transaction(async (tx) => {
      const fileId = `file_${randomUUID()}`;
      await tx.insert(files).values({
        id: fileId, bucket: "private_credentials", objectKey, originalName: input.originalName, mimeType: input.mimeType,
        sizeBytes: input.bytes.byteLength, sha256: createHash("sha256").update(input.bytes).digest("hex"), uploadedBy: actor.userId,
      });
      const [inserted] = await tx.insert(credentials).values({
        id: `cred_${randomUUID()}`, nurseId: actor.userId, type: input.type, licenseType: input.licenseType ?? null,
        expiresOn: input.expiresOn ?? null, screenedOn: input.screenedOn ?? null, fileId, status: "pending", uploadedBy: actor.userId,
      }).returning(columns);
      await recordAudit(tx, {
        actorUserId: actor.userId, actorRole: "nurse", networkId: actor.nurseNetworkId, agencyId: null,
        action: "credential.uploaded", entityType: "credential", entityId: inserted!.id,
        changes: { type: input.type, expiresOn: input.expiresOn ?? null }, // no file key, name or hash
        ...meta,
      });
      // Outbox (§10): network admins learn that something awaits review. Name only, never the credential type.
      await enqueue(tx, { template: "credential.submitted", payload: { nurseName: await userName(tx, actor.userId) }, recipients: actor.nurseNetworkId ? await networkAdmins(tx, actor.nurseNetworkId) : [] });
      return inserted!;
    });
    return toNurseCredential(row, today);
  } catch (err) {
    await storage.deleteObject(objectKey).catch(onCompensateError); // best effort: an orphan object holds no DB reference
    throw err;
  }
}

/**
 * A nurse's identity + non-deleted credentials (newest first), as the contract's NurseDetail. NO authorization here: callers
 * decide who may look. Object keys are never selected; `hasFile` is only a boolean.
 */
export async function loadNurseDetail(db: Db, nurseId: string, now = new Date()): Promise<NurseDetail | null> {
  const [nurse] = await db
    .select({ id: users.id, email: users.email, name: userProfiles.fullName, licenseType: nurseProfiles.licenseType, networkId: nurseProfiles.networkId })
    .from(nurseProfiles)
    .innerJoin(users, eq(users.id, nurseProfiles.userId))
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(eq(nurseProfiles.userId, nurseId), isNull(users.deletedAt)));
  if (!nurse) return null;
  const [rows, tz] = await Promise.all([
    db.select(columns).from(credentials).where(and(eq(credentials.nurseId, nurseId), isNull(credentials.deletedAt))).orderBy(desc(credentials.createdAt), desc(credentials.id)),
    networkDefaultTimezone(db, nurse.networkId),
  ]);
  const today = todayIn(tz, now);
  return { id: nurse.id, name: nurse.name, email: nurse.email, licenseType: (nurse.licenseType as ShiftRole | null) ?? null, credentials: rows.map((r) => toNurseCredential(r, today)) };
}

export type ReviewResult =
  | { ok: true; value: NurseCredential; unassignedShifts: number }
  | { ok: false; denied: Decision & { allow: false } }
  | { ok: false; fail: { status: 404 | 409; error: string } };

/**
 * PATCH /api/credentials/:id/review: a network admin sets verified | rejected. Row lock + update + audit in one transaction (the claim's
 * FOR SHARE on license rows waits for us, so eligibility never reads a half-reviewed row). ineligibility()/isEligible are untouched:
 * rejected stops counting, verified and pending both count. 404 outside the admin's networks (no existence leak); 409 when the
 * credential already has the requested status (it can't go back to pending: DB CHECK credentials_reviewed_iff_not_pending).
 */
export async function review(db: Db, actor: Actor, credentialId: string, status: "verified" | "rejected", meta: RequestMeta, now = new Date()): Promise<ReviewResult> {
  const role = can(actor, "admin:network", { networkId: "" }); // a non-admin is refused before any lookup
  if (!role.allow && role.reason === "role_not_permitted") return { ok: false, denied: role as Decision & { allow: false } };
  const out: { denied?: { id: string; networkId: string } } = {};
  const result = await db.transaction(async (tx): Promise<ReviewResult> => {
    const [row] = await tx
      .select({ ...columns, nurseId: credentials.nurseId, networkId: nurseProfiles.networkId })
      .from(credentials)
      .innerJoin(nurseProfiles, eq(nurseProfiles.userId, credentials.nurseId))
      .where(and(eq(credentials.id, credentialId), isNull(credentials.deletedAt)))
      .for("update", { of: credentials });
    const decision = can(actor, "admin:network", { networkId: row?.networkId ?? "" });
    if (!row || !decision.allow) {
      if (row) out.denied = row;
      return { ok: false, fail: { status: 404, error: ErrorMessage.notFound } };
    }
    if (row.status === status) return { ok: false, fail: { status: 409, error: ErrorMessage.credentialAlreadyReviewed } };
    const [updated] = await tx.update(credentials).set({ status, reviewedBy: actor.userId, reviewedAt: now, updatedAt: now }).where(eq(credentials.id, row.id)).returning(columns);
    await recordAudit(tx, {
      ...meta,
      actorUserId: actor.userId,
      actorRole: actor.role,
      networkId: row.networkId,
      agencyId: null,
      action: "credential.reviewed",
      entityType: "credential",
      entityId: row.id,
      changes: { status: [row.status, status], nurseId: row.nurseId },
    });
    await enqueue(tx, { template: "credential.reviewed", payload: { outcome: status }, recipients: [await userRecipient(tx, row.nurseId)] }); // outcome only: no type, note or file
    // A rejected license may leave the nurse unable to work shifts she already holds: reopen those (same tx).
    const unassignedShifts = status === "rejected" && row.type === "license" ? await unassignAfterLicenseLoss(tx, row.nurseId, actor, meta, now) : 0;
    return { ok: true, value: toNurseCredential(updated!, todayIn(await networkDefaultTimezone(tx, row.networkId), now)), unassignedShifts };
  });
  const d = out.denied; // set inside the tx callback; the denial row is written after it, on its own
  if (d) {
    await recordAudit(db, {
      ...meta, actorUserId: actor.userId, actorRole: actor.role, networkId: d.networkId, agencyId: actor.activeAgencyId ?? null,
      action: "access.denied", entityType: "credential", entityId: d.id, changes: { reason: "out_of_scope" },
    });
  }
  return result;
}

export const DOWNLOAD_TTL_SECONDS = 300;
export type DocumentUrlResult = { ok: true; value: { url: string; expiresAt: string } } | { ok: false; fail: { status: 404; error: string } };

/**
 * GET /api/credentials/:id/download-url (ARCHITECTURE §9.3): a 5-minute signed link to one credential file, for the owner nurse,
 * admins of her network, and owners/managers of an agency she holds a filled shift with. Missing, out of scope, deleted or
 * file-less: one 404 (no existence leak). Audited BEFORE signing: no audit row, no link. Keys and URLs never reach the audit.
 */
export async function documentUrl(db: Db, storage: ObjectStorage, actor: Actor, credentialId: string, meta: RequestMeta, now = new Date()): Promise<DocumentUrlResult> {
  const notFound = { ok: false, fail: { status: 404, error: ErrorMessage.notFound } } as const;
  const [row] = await db
    .select({ nurseId: credentials.nurseId, networkId: nurseProfiles.networkId, objectKey: files.objectKey })
    .from(credentials)
    .innerJoin(nurseProfiles, eq(nurseProfiles.userId, credentials.nurseId))
    .leftJoin(files, eq(files.id, credentials.fileId))
    .where(and(eq(credentials.id, credentialId), isNull(credentials.deletedAt)));
  if (!row) return notFound;
  const holding = actor.role !== "agency" ? [] : await db
    .selectDistinct({ agencyId: shifts.agencyId })
    .from(shifts)
    .where(and(eq(shifts.claimedBy, row.nurseId), eq(shifts.status, "filled"), isNull(shifts.deletedAt)));
  const decision = can(actor, "credential:read-document", { nurseId: row.nurseId, nurseNetworkId: row.networkId, agencyIdsHoldingNurse: holding.map((h) => h.agencyId) });
  if (!decision.allow) { // the credential exists but is not this actor's to see: log it, answer the same uniform 404
    await recordAudit(db, {
      ...meta, actorUserId: actor.userId, actorRole: actor.role, networkId: row.networkId, agencyId: actor.activeAgencyId ?? null,
      action: "access.denied", entityType: "credential", entityId: credentialId, changes: { reason: "out_of_scope" },
    });
    return notFound;
  }
  if (!row.objectKey) return notFound;
  await recordAudit(db, {
    ...meta,
    actorUserId: actor.userId,
    actorRole: actor.role,
    networkId: row.networkId,
    agencyId: actor.activeAgencyId ?? null,
    action: "credential.document_viewed",
    entityType: "credential",
    entityId: credentialId,
    changes: { nurseId: row.nurseId },
  });
  const url = await storage.signedGetUrl(row.objectKey, DOWNLOAD_TTL_SECONDS);
  return { ok: true, value: { url, expiresAt: new Date(now.getTime() + DOWNLOAD_TTL_SECONDS * 1000).toISOString() } };
}
