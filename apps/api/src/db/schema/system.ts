import { sql } from "drizzle-orm";
import { type AnyPgColumn, bigint, char, check, index, integer, jsonb, pgTable, smallint, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, fileBucket, notificationStatus, timestamps, tstz, userRole } from "./_common.js";
import { users } from "./identity.js";

export const files = pgTable(
  "files",
  {
    id: text().primaryKey(),
    bucket: fileBucket().notNull(),
    objectKey: text().notNull(),
    originalName: text(),
    mimeType: text().notNull(),
    sizeBytes: integer().notNull(),
    sha256: char({ length: 64 }).notNull(),
    uploadedBy: text().notNull().references(() => users.id, { onDelete: "restrict" }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("files_bucket_key_uq").on(t.bucket, t.objectKey),
    check("files_size_range", sql`${t.sizeBytes} > 0 AND ${t.sizeBytes} <= 10485760`),
  ],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: text().primaryKey(),
    userId: text().notNull().references(() => users.id, { onDelete: "restrict" }),
    familyId: text().notNull(),
    tokenHash: char({ length: 64 }).notNull().unique("refresh_tokens_token_hash_uq"), // SHA-256; raw token never stored
    expiresAt: tstz().notNull(),
    revokedAt: tstz(),
    replacedBy: text().references((): AnyPgColumn => refreshTokens.id, { onDelete: "restrict" }),
    userAgent: text(),
    ip: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("refresh_tokens_user_active_idx").on(t.userId).where(sql`${t.revokedAt} IS NULL`),
    index("refresh_tokens_family_idx").on(t.familyId),
  ],
);

/** Email outbox. */
export const notifications = pgTable(
  "notifications",
  {
    id: text().primaryKey(),
    recipientUserId: text().references(() => users.id, { onDelete: "restrict" }),
    recipientEmail: text().notNull(),
    template: text().notNull(),
    payload: jsonb().notNull(), // minimal, no health data
    status: notificationStatus().notNull().default("pending"),
    attempts: smallint().notNull().default(0),
    nextAttemptAt: tstz().notNull().defaultNow(),
    lockedUntil: tstz(), // lease while status = 'sending': a dispatcher claimed the row; after this instant it may be reclaimed
    lastError: text(),
    dedupeKey: text(), // reminders only: one row per key (partial unique index) makes the sweep idempotent
    sentAt: tstz(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [
    index("notifications_pending_idx").on(t.status, t.nextAttemptAt).where(sql`${t.status} = 'pending'`),
    uniqueIndex("notifications_dedupe_uq").on(t.dedupeKey).where(sql`${t.dedupeKey} IS NOT NULL`),
  ],
);

/** Append-only: UPDATE/DELETE blocked by trigger (see custom migration). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: tstz().notNull().defaultNow(),
    actorUserId: text().references(() => users.id, { onDelete: "restrict" }), // null = system
    actorRole: userRole(),
    networkId: text(),
    agencyId: text(),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    changes: jsonb(),
    requestId: text(),
    ip: text(),
    userAgent: text(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entityType, t.entityId, t.occurredAt),
    index("audit_network_idx").on(t.networkId, t.occurredAt.desc()),
    index("audit_agency_idx").on(t.agencyId, t.occurredAt.desc()),
    index("audit_network_id_idx").on(t.networkId, t.id.desc()), // keyset reads (GET /api/audit-logs): WHERE network_id ORDER BY id DESC
    index("audit_agency_id_idx").on(t.agencyId, t.id.desc()),
    index("audit_actor_idx").on(t.actorUserId, t.occurredAt.desc()),
  ],
);
