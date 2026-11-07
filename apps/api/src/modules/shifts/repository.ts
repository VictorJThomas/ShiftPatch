import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import {
  agencies, agencyMemberships, credentials, facilities, hospitalNetworks, networkAgencies, notifications, nurseProfiles, shiftCancellations, shifts, users,
} from "../../db/schema/index.js";
import type { Tx } from "../audit/audit.js";
import {
  type AgencyScope,
  assertAgencyScope,
  assertMarketplaceScope,
  assertNetworkScope,
  type MarketplaceScope,
  type NetworkScope,
} from "../authz/scope.js";

// Tenant data: every shift query takes a scope object that only the authorization layer can issue. No unscoped variant exists.

const shiftColumns = {
  id: shifts.id,
  agencyId: shifts.agencyId,
  agencyName: agencies.name,
  role: shifts.role,
  shiftDate: shifts.shiftDate,
  startTime: shifts.startTime,
  endTime: shifts.endTime,
  timezone: shifts.timezone,
  status: shifts.status,
  claimedBy: shifts.claimedBy,
};

const byNumericId = [asc(sql`length(${shifts.id})`), asc(shifts.id)] as const; // shift-2 before shift-10, no cast that a odd id could break

export async function listByAgency(db: Db, scope: AgencyScope) {
  assertAgencyScope(scope);
  return db
    .select(shiftColumns)
    .from(shifts)
    .innerJoin(agencies, eq(agencies.id, shifts.agencyId))
    .where(and(inArray(shifts.agencyId, [...scope.agencyIds]), isNull(shifts.deletedAt)))
    .orderBy(...byNumericId);
}

/** Admin reporting: one network's shifts across all its agencies. */
export async function listByNetwork(db: Db, scope: NetworkScope) {
  assertNetworkScope(scope);
  return db
    .select(shiftColumns)
    .from(shifts)
    .innerJoin(agencies, eq(agencies.id, shifts.agencyId))
    .where(and(eq(shifts.networkId, scope.networkId), isNull(shifts.deletedAt)))
    .orderBy(...byNumericId);
}

/** Marketplace: all non-deleted shifts (open + filled...), optionally one network and/or open only. */
export async function listMarketplace(db: Db, scope: MarketplaceScope, opts: { openOnly: boolean }) {
  assertMarketplaceScope(scope);
  return db
    .select(shiftColumns)
    .from(shifts)
    .innerJoin(agencies, eq(agencies.id, shifts.agencyId))
    .where(
      and(
        isNull(shifts.deletedAt),
        scope.networkId === null ? undefined : eq(shifts.networkId, scope.networkId),
        opts.openOnly ? eq(shifts.status, "open") : undefined,
      ),
    )
    .orderBy(...byNumericId);
}

export interface NewShift {
  role: "RN" | "LPN" | "CNA";
  date: string;
  startTime: string;
  endTime: string;
  facilityId: string | null;
  timezone: string;
  networkId: string;
  createdBy: string;
}

/**
 * Insert from an explicit allowlist. agencyId comes from the scope, never from input; `id` (sequence), `status` (default open)
 * and `claimedBy` (null) are left to the database.
 */
export async function insertShift(db: Db | Tx, scope: AgencyScope, f: NewShift) {
  assertAgencyScope(scope);
  const agencyId = scope.agencyIds[0];
  if (scope.agencyIds.length !== 1 || !agencyId) throw new Error("insertShift: scope must name exactly one agency");
  const [row] = await db
    .insert(shifts)
    .values({
      networkId: f.networkId,
      agencyId,
      facilityId: f.facilityId,
      role: f.role,
      shiftDate: f.date,
      startTime: f.startTime,
      endTime: f.endTime,
      timezone: f.timezone,
      createdBy: f.createdBy,
    })
    .returning({ id: shifts.id });
  const [created] = await db.select(shiftColumns).from(shifts).innerJoin(agencies, eq(agencies.id, shifts.agencyId)).where(eq(shifts.id, row!.id));
  return created!;
}

// ---- Narrow lookups by id: facts for policies/services, never tenant listings. ----

/** Network an active agency is approved in, or null (unknown / suspended agency). */
export async function agencyNetworkId(db: Db, agencyId: string): Promise<string | null> {
  const [row] = await db
    .select({ networkId: networkAgencies.networkId })
    .from(networkAgencies)
    .innerJoin(agencies, eq(agencies.id, networkAgencies.agencyId))
    .where(and(eq(networkAgencies.agencyId, agencyId), eq(networkAgencies.status, "active"), isNull(agencies.deletedAt)))
    .limit(1);
  return row?.networkId ?? null;
}

/** Facility's timezone when it is active and belongs to `networkId`, else null. */
export async function facilityTimezone(db: Db, facilityId: string, networkId: string): Promise<string | null> {
  const [row] = await db
    .select({ timezone: facilities.timezone })
    .from(facilities)
    .where(and(eq(facilities.id, facilityId), eq(facilities.networkId, networkId), eq(facilities.status, "active"), isNull(facilities.deletedAt)))
    .limit(1);
  return row?.timezone ?? null;
}

export async function networkDefaultTimezone(db: Db, networkId: string): Promise<string> {
  const [row] = await db.select({ tz: hospitalNetworks.defaultTimezone }).from(hospitalNetworks).where(eq(hospitalNetworks.id, networkId));
  return row?.tz ?? "America/New_York";
}

export async function nurseLicenseType(db: Db, nurseId: string): Promise<string | null> {
  const [row] = await db.select({ t: nurseProfiles.licenseType }).from(nurseProfiles).where(eq(nurseProfiles.userId, nurseId));
  return row?.t ?? null;
}

/** The nurse's own non-deleted license credentials (callers pass the authenticated actor's id). */
export async function licensesOf(db: Db, nurseId: string) {
  return db
    .select({ status: credentials.status, expiresOn: credentials.expiresOn })
    .from(credentials)
    .where(and(eq(credentials.nurseId, nurseId), eq(credentials.type, "license"), isNull(credentials.deletedAt)));
}

// ---- Claim / cancel (run inside the service's transaction; callers authorize first) ----

type Q = Db | Tx;

/** A non-deleted shift's facts. `lock` = `FOR UPDATE`, so racing cancels serialize and read the previous nurse reliably. */
export async function findLiveShift(q: Q, id: string, opts: { lock?: boolean } = {}) {
  const query = q
    .select({
      id: shifts.id,
      networkId: shifts.networkId,
      agencyId: shifts.agencyId,
      role: shifts.role,
      shiftDate: shifts.shiftDate,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      timezone: shifts.timezone,
      status: shifts.status,
      claimedBy: shifts.claimedBy,
    })
    .from(shifts)
    .where(and(eq(shifts.id, id), isNull(shifts.deletedAt)));
  const [row] = await (opts.lock ? query.for("update") : query);
  return row ?? null;
}

/** The nurse's license rows under `FOR SHARE`: a concurrent credential UPDATE waits for us (and we wait for it), so no stale check. */
export async function lockLicenses(tx: Tx, nurseId: string) {
  return tx
    .select({ status: credentials.status, expiresOn: credentials.expiresOn, deletedAt: credentials.deletedAt })
    .from(credentials)
    .where(and(eq(credentials.nurseId, nurseId), eq(credentials.type, "license"), isNull(credentials.deletedAt)))
    .for("share");
}

/** The atomic claim: one statement, so exactly one concurrent caller sees the row still `open`. false = someone else won. */
export async function claimRow(tx: Tx, f: { id: string; nurseId: string; networkId: string; now: Date }): Promise<boolean> {
  const rows = await tx
    .update(shifts)
    .set({ status: "filled", claimedBy: f.nurseId, claimedAt: f.now, updatedAt: f.now })
    .where(and(eq(shifts.id, f.id), eq(shifts.status, "open"), isNull(shifts.deletedAt), eq(shifts.networkId, f.networkId)))
    .returning({ id: shifts.id });
  return rows.length === 1;
}

/** filled -> open. false = not filled any more (a racing cancel already reopened it). */
export async function reopenRow(tx: Tx, id: string, now: Date): Promise<boolean> {
  const rows = await tx
    .update(shifts)
    .set({ status: "open", claimedBy: null, claimedAt: null, updatedAt: now })
    .where(and(eq(shifts.id, id), eq(shifts.status, "filled"), isNull(shifts.deletedAt)))
    .returning({ id: shifts.id });
  return rows.length === 1;
}

/** The mapper input for one shift (same columns as the lists). */
export async function shiftView(q: Q, id: string) {
  const [row] = await q.select(shiftColumns).from(shifts).innerJoin(agencies, eq(agencies.id, shifts.agencyId)).where(eq(shifts.id, id));
  return row!;
}

export const insertCancellation = (tx: Tx, c: typeof shiftCancellations.$inferInsert) => tx.insert(shiftCancellations).values(c);

/** Active owners/managers of the agency (+ the previous nurse when given), with the email to notify. One row per user. */
export async function cancelRecipients(q: Q, agencyId: string, previousNurseId: string) {
  const managers = await q
    .select({ userId: users.id, email: users.email })
    .from(agencyMemberships)
    .innerJoin(users, eq(users.id, agencyMemberships.userId))
    .where(
      and(
        eq(agencyMemberships.agencyId, agencyId),
        isNull(agencyMemberships.revokedAt),
        inArray(agencyMemberships.role, ["owner", "manager"]),
        isNull(users.deletedAt),
        eq(users.status, "active"),
      ),
    );
  const [nurse] = await q
    .select({ userId: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.id, previousNurseId), isNull(users.deletedAt), eq(users.status, "active")));
  return { managers, nurse: nurse ?? null };
}

export const insertNotifications = (tx: Tx, rows: (typeof notifications.$inferInsert)[]) => (rows.length ? tx.insert(notifications).values(rows) : Promise.resolve());
