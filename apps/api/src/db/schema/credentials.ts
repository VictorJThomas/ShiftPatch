import { sql } from "drizzle-orm";
import { char, check, date, index, pgTable, text } from "drizzle-orm/pg-core";
import { credentialStatus, credentialType, tbTestType, timestamps, tstz } from "./_common.js";
import { nurseProfiles, users } from "./identity.js";
import { files } from "./system.js";

export const credentials = pgTable(
  "credentials",
  {
    id: text().primaryKey(),
    nurseId: text().notNull().references(() => nurseProfiles.userId, { onDelete: "restrict" }),
    type: credentialType().notNull(),
    licenseType: text(),
    number: text(),
    issuingState: char({ length: 2 }),
    issuedOn: date({ mode: "string" }),
    expiresOn: date({ mode: "string" }), // nullable: not every document expires
    screenedOn: date({ mode: "string" }),
    tbTestType: tbTestType(), // no clinical result is stored
    recheckDueOn: date({ mode: "string" }),
    fileId: text().references(() => files.id, { onDelete: "restrict" }), // null for seeded credentials
    status: credentialStatus().notNull().default("pending"),
    uploadedBy: text().references(() => users.id, { onDelete: "restrict" }),
    reviewedBy: text().references(() => users.id, { onDelete: "restrict" }),
    reviewedAt: tstz(),
    reviewNote: text(),
    ...timestamps(),
  },
  (t) => [
    check("credentials_license_needs_expiry", sql`${t.type} <> 'license' OR ${t.expiresOn} IS NOT NULL`),
    check("credentials_tb_needs_screened_on", sql`${t.type} <> 'tb_screening' OR ${t.screenedOn} IS NOT NULL`),
    check("credentials_expiry_after_issue", sql`${t.expiresOn} IS NULL OR ${t.issuedOn} IS NULL OR ${t.expiresOn} >= ${t.issuedOn}`),
    check("credentials_reviewed_iff_not_pending", sql`(${t.status} = 'pending') = (${t.reviewedAt} IS NULL)`),
    check("credentials_license_type", sql`${t.licenseType} IS NULL OR ${t.licenseType} IN ('RN','LPN','CNA')`),
    index("credentials_nurse_type_idx").on(t.nurseId, t.type).where(sql`${t.deletedAt} IS NULL`),
  ],
);
