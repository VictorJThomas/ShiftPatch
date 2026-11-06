import { sql } from "drizzle-orm";
import { char, check, index, numeric, pgTable, primaryKey, text, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, membershipRole, nurseStatus, orgStatus, timestamps, tstz, userRole, userStatus } from "./_common.js";
import { files } from "./system.js";

export const hospitalNetworks = pgTable("hospital_networks", {
  id: text().primaryKey(),
  name: text().notNull(),
  defaultTimezone: text().notNull().default("America/New_York"),
  status: orgStatus().notNull().default("active"),
  ...timestamps(),
}, (t) => [check("hospital_networks_name_nonblank", sql`length(trim(${t.name})) > 0`)]);

export const users = pgTable(
  "users",
  {
    id: text().primaryKey(),
    email: text().notNull(),
    passwordHash: text().notNull(),
    role: userRole().notNull(),
    status: userStatus().notNull().default("active"),
    lastLoginAt: tstz(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(sql`lower(${t.email})`).where(sql`${t.deletedAt} IS NULL`),
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("users_email_nonblank", sql`length(trim(${t.email})) > 0`),
  ],
);

export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: text().primaryKey().references(() => users.id, { onDelete: "restrict" }),
    fullName: text().notNull(),
    phone: text(),
    avatarFileId: text().references(() => files.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [check("user_profiles_full_name_nonblank", sql`length(trim(${t.fullName})) > 0`)],
);

export const nurseProfiles = pgTable(
  "nurse_profiles",
  {
    userId: text().primaryKey().references(() => users.id, { onDelete: "restrict" }),
    networkId: text().notNull().references(() => hospitalNetworks.id, { onDelete: "restrict" }),
    licenseType: text(), // null for seed nurses: the spec gives none
    primaryState: char({ length: 2 }),
    status: nurseStatus().notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [
    check("nurse_profiles_license_type", sql`${t.licenseType} IS NULL OR ${t.licenseType} IN ('RN','LPN','CNA')`),
    unique("nurse_profiles_user_network_uq").on(t.userId, t.networkId), // target of shifts_network_nurse_fk
  ],
);

export const agencies = pgTable(
  "agencies",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text(),
    phone: text(),
    addressLine1: text(),
    addressLine2: text(),
    city: text(),
    state: text(),
    postalCode: text(),
    country: text().notNull().default("US"),
    logoFileId: text().references(() => files.id, { onDelete: "restrict" }),
    status: orgStatus().notNull().default("active"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("agencies_name_uq").on(sql`lower(${t.name})`).where(sql`${t.deletedAt} IS NULL`),
    check("agencies_name_nonblank", sql`length(trim(${t.name})) > 0`),
  ],
);

export const networkAgencies = pgTable(
  "network_agencies",
  {
    networkId: text().notNull().references(() => hospitalNetworks.id, { onDelete: "restrict" }),
    agencyId: text().notNull().references(() => agencies.id, { onDelete: "restrict" }),
    status: orgStatus().notNull().default("active"),
    approvedAt: tstz().notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  // Composite PK is also the target of shifts' (network_id, agency_id) FK.
  (t) => [primaryKey({ columns: [t.networkId, t.agencyId] })],
);

export const agencyMemberships = pgTable(
  "agency_memberships",
  {
    id: text().primaryKey(),
    userId: text().notNull().references(() => users.id, { onDelete: "restrict" }),
    agencyId: text().notNull().references(() => agencies.id, { onDelete: "restrict" }),
    role: membershipRole().notNull(),
    revokedAt: tstz(),
    revokedBy: text().references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [
    uniqueIndex("agency_memberships_active_uq").on(t.userId, t.agencyId).where(sql`${t.revokedAt} IS NULL`),
    index("agency_memberships_user_active_idx").on(t.userId).where(sql`${t.revokedAt} IS NULL`),
    check("agency_memberships_revoked_pair", sql`(${t.revokedAt} IS NULL) = (${t.revokedBy} IS NULL)`),
  ],
);

export const networkMemberships = pgTable(
  "network_memberships",
  {
    id: text().primaryKey(),
    userId: text().notNull().references(() => users.id, { onDelete: "restrict" }),
    networkId: text().notNull().references(() => hospitalNetworks.id, { onDelete: "restrict" }),
    revokedAt: tstz(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [uniqueIndex("network_memberships_active_uq").on(t.userId, t.networkId).where(sql`${t.revokedAt} IS NULL`)],
);

export const facilities = pgTable(
  "facilities",
  {
    id: text().primaryKey(),
    networkId: text().notNull().references(() => hospitalNetworks.id, { onDelete: "restrict" }),
    name: text().notNull(),
    addressLine1: text().notNull(),
    addressLine2: text(),
    city: text().notNull(),
    state: char({ length: 2 }).notNull(),
    postalCode: text().notNull(),
    country: text().notNull().default("US"),
    timezone: text().notNull(),
    latitude: numeric({ precision: 9, scale: 6 }),
    longitude: numeric({ precision: 9, scale: 6 }),
    phone: text(),
    status: orgStatus().notNull().default("active"),
    ...timestamps(),
  },
  (t) => [
    unique("facilities_id_network_uq").on(t.id, t.networkId), // target of shifts_network_facility_fk
    check("facilities_name_nonblank", sql`length(trim(${t.name})) > 0`),
    check("facilities_latitude_range", sql`${t.latitude} IS NULL OR ${t.latitude} BETWEEN -90 AND 90`),
    check("facilities_longitude_range", sql`${t.longitude} IS NULL OR ${t.longitude} BETWEEN -180 AND 180`),
  ],
);
