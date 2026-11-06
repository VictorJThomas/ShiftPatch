import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, integer, pgSequence, pgTable, text, time } from "drizzle-orm/pg-core";
import { cancelReason, createdAt, shiftStatus, timestamps, tstz, userRole } from "./_common.js";
import { agencies, facilities, hospitalNetworks, networkAgencies, nurseProfiles, users } from "./identity.js";

// Seeds use shift-1..3; generated ids start after them (ARCHITECTURE §4.4).
export const shiftIdSeq = pgSequence("shift_id_seq", { startWith: 4 });

export const shifts = pgTable(
  "shifts",
  {
    id: text().primaryKey().default(sql`'shift-' || nextval('shift_id_seq')`),
    networkId: text().notNull().references(() => hospitalNetworks.id, { onDelete: "restrict" }),
    agencyId: text().notNull().references(() => agencies.id, { onDelete: "restrict" }),
    facilityId: text().references(() => facilities.id, { onDelete: "restrict" }),
    role: text().notNull(),
    shiftDate: date({ mode: "string" }).notNull(), // facility-local, no tz conversion [Spec]
    startTime: time().notNull(),
    endTime: time().notNull(), // end < start = ends next day
    timezone: text().notNull(),
    status: shiftStatus().notNull().default("open"),
    claimedBy: text().references(() => nurseProfiles.userId, { onDelete: "restrict" }),
    claimedAt: tstz(),
    description: text(),
    payRateCents: integer(),
    createdBy: text().notNull().references(() => users.id, { onDelete: "restrict" }),
    ...timestamps(),
  },
  (t) => [
    // Multi-agency isolation: the shift's agency must be an approved vendor of the shift's network.
    foreignKey({
      name: "shifts_network_agency_fk",
      columns: [t.networkId, t.agencyId],
      foreignColumns: [networkAgencies.networkId, networkAgencies.agencyId],
    }).onDelete("restrict"),
    check("shifts_role_valid", sql`${t.role} IN ('RN','LPN','CNA')`),
    check("shifts_times_differ", sql`${t.startTime} <> ${t.endTime}`),
    check("shifts_pay_nonneg", sql`${t.payRateCents} IS NULL OR ${t.payRateCents} >= 0`),
    // Core rule: filled <=> has a nurse.
    check("shifts_filled_iff_claimed", sql`(${t.status} = 'filled') = (${t.claimedBy} IS NOT NULL)`),
    check("shifts_filled_has_claimed_at", sql`${t.status} <> 'filled' OR ${t.claimedAt} IS NOT NULL`),
    index("shifts_agency_status_idx").on(t.agencyId, t.status).where(sql`${t.deletedAt} IS NULL`),
    index("shifts_network_status_date_idx").on(t.networkId, t.status, t.shiftDate).where(sql`${t.deletedAt} IS NULL`),
    index("shifts_claimed_by_idx").on(t.claimedBy).where(sql`${t.claimedBy} IS NOT NULL`),
  ],
);

export const shiftCancellations = pgTable(
  "shift_cancellations",
  {
    id: text().primaryKey(),
    shiftId: text().notNull().references(() => shifts.id, { onDelete: "restrict" }),
    reason: cancelReason().notNull(),
    previousNurseId: text().notNull().references(() => nurseProfiles.userId, { onDelete: "restrict" }),
    cancelledBy: text().notNull().references(() => users.id, { onDelete: "restrict" }),
    cancelledByRole: userRole().notNull(),
    note: text(),
    createdAt: createdAt(), // append-only: no updated_at / deleted_at
  },
  (t) => [
    index("shift_cancellations_shift_idx").on(t.shiftId, t.createdAt),
    index("shift_cancellations_nurse_idx").on(t.previousNurseId),
  ],
);
