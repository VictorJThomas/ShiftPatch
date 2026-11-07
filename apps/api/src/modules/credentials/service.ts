// Nurse credential uploads and the nurse's own credential list (ARCHITECTURE §9.2, §5.3). Callers authorize first.
import { createHash, randomUUID } from "node:crypto";
import type { CredentialType, NurseCredential, ShiftRole } from "@shiftpatch/contracts";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { credentials, files } from "../../db/schema/index.js";
import { type ObjectStorage, StorageError } from "../../lib/storage.js";
import { type RequestMeta, recordAudit } from "../audit/audit.js";
import type { Actor } from "../authz/actor.js";
import { isEligible, todayIn } from "../shifts/eligibility.js";
import { networkDefaultTimezone } from "../shifts/repository.js";

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
  await storage.putObject(objectKey, input.bytes, input.mimeType).catch((cause: unknown) => {
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
      return inserted!;
    });
    return toNurseCredential(row, today);
  } catch (err) {
    await storage.deleteObject(objectKey).catch(onCompensateError); // best effort: an orphan object holds no DB reference
    throw err;
  }
}
