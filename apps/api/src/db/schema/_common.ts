import { pgEnum, timestamp } from "drizzle-orm/pg-core";

// Column names are snake_case via `casing: "snake_case"` (client.ts + drizzle.config.ts).
const tstz = () => timestamp({ withTimezone: true });

/** created_at / updated_at / deleted_at for business tables (ARCHITECTURE §4.1). */
export const timestamps = () => ({
  createdAt: tstz().notNull().defaultNow(),
  updatedAt: tstz().notNull().defaultNow(), // maintained by the repository layer
  deletedAt: tstz(),
});
export const createdAt = () => tstz().notNull().defaultNow();
export { tstz };

export const userRole = pgEnum("user_role", ["nurse", "agency", "admin"]);
export const userStatus = pgEnum("user_status", ["active", "suspended"]);
export const nurseStatus = pgEnum("nurse_status", ["active", "inactive"]);
export const orgStatus = pgEnum("org_status", ["active", "suspended"]);
export const membershipRole = pgEnum("membership_role", ["owner", "manager", "viewer"]);
export const shiftStatus = pgEnum("shift_status", ["open", "filled", "cancelled", "completed"]);
export const cancelReason = pgEnum("cancel_reason", ["no-show", "advance"]);
export const credentialType = pgEnum("credential_type", ["license", "tb_screening", "other"]);
export const credentialStatus = pgEnum("credential_status", ["pending", "verified", "rejected"]);
export const tbTestType = pgEnum("tb_test_type", ["igra", "tst", "chest_xray", "other"]);
export const fileBucket = pgEnum("file_bucket", ["public_assets", "private_credentials"]);
export const notificationStatus = pgEnum("notification_status", ["pending", "sent", "failed"]);
