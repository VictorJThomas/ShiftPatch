import { pathToFileURL } from "node:url";
import { hash } from "@node-rs/argon2";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "./client.js";
import * as s from "./schema/index.js";

// Exact data from docs/original/ShiftPatch-Technical-Spec.md plus the minimum structure (ARCHITECTURE §4.6).
const PASSWORD = "Trial2026!";
const NETWORK = "network-default"; // structural, not visible in any contract
const TZ = "America/New_York";

const agencies = [
  { id: "agency-a", name: "Sunrise Health Staffing", email: "admin@sunrisehealth.example" },
  { id: "agency-b", name: "Metro Care Partners", email: "admin@metrocare.example" },
];
const nurses = [
  { id: "nurse-1", name: "Maria Lopez", email: "maria.lopez@example.com", licenseExpires: "2027-01-01" },
  { id: "nurse-2", name: "James Cook", email: "james.cook@example.com", licenseExpires: "2026-06-01" },
];
const admin = { id: "admin-1", name: "Alex Kim", email: "alex.kim@example.com" };

/** Idempotent: every insert is ON CONFLICT DO NOTHING, so re-running never duplicates or overwrites. */
export async function seed(db: Db) {
  const passwordHash = await hash(PASSWORD, { algorithm: 2 }); // 2 = argon2id
  await db.transaction(async (tx) => {
    await tx.insert(s.hospitalNetworks).values({ id: NETWORK, name: "Default Network" }).onConflictDoNothing();
    await tx.insert(s.agencies).values(agencies.map(({ id, name }) => ({ id, name }))).onConflictDoNothing();
    await tx.insert(s.networkAgencies).values(agencies.map((a) => ({ networkId: NETWORK, agencyId: a.id }))).onConflictDoNothing();

    const people = [
      ...agencies.map((a) => ({ id: a.id, email: a.email, name: a.name, role: "agency" as const })),
      ...nurses.map((n) => ({ id: n.id, email: n.email, name: n.name, role: "nurse" as const })),
      { ...admin, role: "admin" as const },
    ];
    await tx.insert(s.users).values(people.map((p) => ({ id: p.id, email: p.email, role: p.role, passwordHash }))).onConflictDoNothing();
    await tx.insert(s.userProfiles).values(people.map((p) => ({ userId: p.id, fullName: p.name }))).onConflictDoNothing();

    await tx.insert(s.nurseProfiles).values(nurses.map((n) => ({ userId: n.id, networkId: NETWORK }))).onConflictDoNothing();
    await tx
      .insert(s.agencyMemberships)
      .values(agencies.map((a) => ({ id: `agm-${a.id}`, userId: a.id, agencyId: a.id, role: "owner" as const })))
      .onConflictDoNothing();
    await tx.insert(s.networkMemberships).values({ id: `nwm-${admin.id}`, userId: admin.id, networkId: NETWORK }).onConflictDoNothing();

    // Verified by admin-1; fixed timestamp keeps the seed deterministic. No file: seeded credentials have none.
    await tx
      .insert(s.credentials)
      .values(
        nurses.map((n) => ({
          id: `cred-${n.id}`, nurseId: n.id, type: "license" as const, expiresOn: n.licenseExpires,
          status: "verified" as const, reviewedBy: admin.id, reviewedAt: new Date("2026-01-01T00:00:00Z"),
        })),
      )
      .onConflictDoNothing();

    const shift = { networkId: NETWORK, timezone: TZ };
    await tx
      .insert(s.shifts)
      .values([
        { ...shift, id: "shift-1", agencyId: "agency-a", createdBy: "agency-a", role: "RN", shiftDate: "2026-10-02", startTime: "19:00", endTime: "07:00", status: "open" },
        { ...shift, id: "shift-2", agencyId: "agency-a", createdBy: "agency-a", role: "LPN", shiftDate: "2026-10-03", startTime: "07:00", endTime: "19:00", status: "filled", claimedBy: "nurse-1", claimedAt: new Date("2026-09-01T12:00:00Z") },
        { ...shift, id: "shift-3", agencyId: "agency-b", createdBy: "agency-b", role: "RN", shiftDate: "2026-10-04", startTime: "19:00", endTime: "07:00", status: "open" },
      ])
      .onConflictDoNothing();

    // Next generated id must follow the highest existing one (never lower the sequence).
    await tx.execute(sql`
      SELECT setval('shift_id_seq', GREATEST(
        3,
        (SELECT coalesce(max(substring(id from 7)::bigint), 0) FROM shifts WHERE id ~ '^shift-[0-9]+$'),
        (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM shift_id_seq)
      ))`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // MIGRATE_DATABASE_URL = the schema owner (prod: the API's runtime DATABASE_URL is the least-privilege role, which has no DDL).
  const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("MIGRATE_DATABASE_URL or DATABASE_URL is required");
  const { db, sql: client } = createDb(url);
  await seed(db);
  await client.end();
  console.log("seed ok");
}
