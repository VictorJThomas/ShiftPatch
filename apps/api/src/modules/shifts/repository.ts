import { and, asc, desc, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import {
  agencies, credentials, facilities, hospitalNetworks, networkAgencies, nurseProfiles, shiftCancellations, shifts, userProfiles,
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
import { agencyManagers, userRecipient } from "../notifications/recipients.js";

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

export interface ShiftFilters {
  status?: "open" | "filled" | "cancelled" | "completed" | undefined;
  role?: "RN" | "LPN" | "CNA" | undefined;
  date?: string | undefined;
  agencyId?: string | undefined;
}
const filterConds = (f: ShiftFilters) => [
  f.status ? eq(shifts.status, f.status) : undefined,
  f.role ? eq(shifts.role, f.role) : undefined,
  f.date ? eq(shifts.shiftDate, f.date) : undefined,
  f.agencyId ? eq(shifts.agencyId, f.agencyId) : undefined,
];

/** `%`, `_` and the backslash in user text are literals, not wildcards (Postgres LIKE escapes with a backslash by default). */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

/** Marketplace: all non-deleted shifts (open + filled...), optionally one network and/or open only, plus optional AND filters. */
export async function listMarketplace(db: Db, scope: MarketplaceScope, opts: { openOnly: boolean; filters?: ShiftFilters }) {
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
        ...filterConds(opts.filters ?? {}),
      ),
    )
    .orderBy(...byNumericId);
}

// ---- Coverage: shifts + the claiming nurse's name (agency and admin tables). One column list, one mapper. ----

const coverageColumns = { ...shiftColumns, claimedByName: userProfiles.fullName };

/** Case-insensitive search over the nurse name and the shift id, plus the agency name for the admin table. */
const searchCond = (q: string | undefined, withAgency: boolean): SQL | undefined => {
  if (!q) return undefined;
  const p = likePattern(q);
  return or(sql`${userProfiles.fullName} ILIKE ${p}`, sql`${shifts.id} ILIKE ${p}`, withAgency ? sql`${agencies.name} ILIKE ${p}` : undefined);
};

const coverageBase = (db: Db) =>
  db
    .select(coverageColumns)
    .from(shifts)
    .innerJoin(agencies, eq(agencies.id, shifts.agencyId))
    .leftJoin(userProfiles, eq(userProfiles.userId, shifts.claimedBy));

/** One agency's shifts with nurse names. Filters AND together. */
export async function coverageByAgency(db: Db, scope: AgencyScope, f: Omit<ShiftFilters, "agencyId"> & { q?: string | undefined }) {
  assertAgencyScope(scope);
  return coverageBase(db)
    .where(and(inArray(shifts.agencyId, [...scope.agencyIds]), isNull(shifts.deletedAt), ...filterConds(f), searchCond(f.q, false)))
    .orderBy(...byNumericId);
}

/** One page of a network's shifts + per-status counts for the (agencyId, q) base. Scope = every network the admin administers. */
export async function coverageByNetworks(
  db: Db,
  scopes: NetworkScope[],
  f: { status?: ShiftFilters["status"]; agencyId?: string | undefined; q?: string | undefined; sort?: "asc" | "desc"; limit: number; offset: number },
) {
  for (const s of scopes) assertNetworkScope(s);
  const base = [inArray(shifts.networkId, scopes.map((s) => s.networkId)), isNull(shifts.deletedAt), ...filterConds({ agencyId: f.agencyId }), searchCond(f.q, true)];
  const [rows, counts] = await Promise.all([
    coverageBase(db)
      .where(and(...base, ...filterConds({ status: f.status })))
      .orderBy(...(f.sort === "desc" ? [desc(shifts.shiftDate), desc(shifts.startTime), desc(sql`length(${shifts.id})`), desc(shifts.id)] : [asc(shifts.shiftDate), asc(shifts.startTime), ...byNumericId]))
      .limit(f.limit)
      .offset(f.offset),
    db
      .select({ status: shifts.status, n: sql<number>`count(*)::int` })
      .from(shifts)
      .innerJoin(agencies, eq(agencies.id, shifts.agencyId))
      .leftJoin(userProfiles, eq(userProfiles.userId, shifts.claimedBy))
      .where(and(...base))
      .groupBy(shifts.status),
  ]);
  return { rows, counts };
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

export async function facilityName(q: Q, facilityId: string): Promise<string | null> {
  const [row] = await q.select({ name: facilities.name }).from(facilities).where(eq(facilities.id, facilityId));
  return row?.name ?? null;
}

export async function networkDefaultTimezone(db: Db | Tx, networkId: string): Promise<string> {
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

/** open -> cancelled (agency withdrawal). One statement: false = no longer open (claimed, withdrawn or deleted meanwhile). */
export async function withdrawRow(tx: Tx, id: string, now: Date): Promise<boolean> {
  const rows = await tx
    .update(shifts)
    .set({ status: "cancelled", updatedAt: now })
    .where(and(eq(shifts.id, id), eq(shifts.status, "open"), isNull(shifts.deletedAt)))
    .returning({ id: shifts.id });
  return rows.length === 1;
}

/** Cap on GET /api/nurses/me/shifts: most recent shifts only, so a long-tenured nurse can't make the response unbounded. */
export const NURSE_SHIFTS_LIMIT = 200;

/** The nurse's own shifts (filled + completed), newest date first, at most NURSE_SHIFTS_LIMIT. `nurseId` must be the authenticated actor's id. */
export async function listClaimedBy(db: Db, nurseId: string) {
  return db
    .select(shiftColumns)
    .from(shifts)
    .innerJoin(agencies, eq(agencies.id, shifts.agencyId))
    .where(and(eq(shifts.claimedBy, nurseId), inArray(shifts.status, ["filled", "completed"]), isNull(shifts.deletedAt)))
    .orderBy(desc(shifts.shiftDate), desc(shifts.startTime), ...byNumericId)
    .limit(NURSE_SHIFTS_LIMIT);
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
  const managers = await agencyManagers(q, agencyId);
  const nurse = await userRecipient(q, previousNurseId);
  return { managers, nurse };
}
