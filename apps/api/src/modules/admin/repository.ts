import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { agencies, agencyMemberships, networkAgencies, nurseProfiles, shifts, userProfiles, users } from "../../db/schema/index.js";
import { assertNetworkScope, type NetworkScope } from "../authz/scope.js";
import { likePattern } from "../shifts/repository.js";

// Admin directory reads. Every query takes the NetworkScope(s) the authorization layer issued: nothing here can cross a network.

const ids = (scopes: NetworkScope[]) => {
  for (const s of scopes) assertNetworkScope(s);
  return scopes.map((s) => s.networkId);
};

export interface UserPage { q?: string | undefined; after?: string | undefined; limit: number }

/** `limit + 1` rows ordered by id, so the caller can tell whether another page exists. */
export async function listNurses(db: Db, scopes: NetworkScope[], p: UserPage) {
  const like = p.q ? likePattern(p.q) : undefined;
  return db
    .select({ id: users.id, name: userProfiles.fullName, email: users.email, licenseType: nurseProfiles.licenseType })
    .from(nurseProfiles)
    .innerJoin(users, eq(users.id, nurseProfiles.userId))
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(
      and(
        inArray(nurseProfiles.networkId, ids(scopes)),
        isNull(users.deletedAt),
        p.after ? sql`${users.id} > ${p.after}` : undefined,
        like ? or(sql`${userProfiles.fullName} ILIKE ${like}`, sql`${users.email} ILIKE ${like}`) : undefined,
      ),
    )
    .orderBy(asc(users.id))
    .limit(p.limit + 1);
}

export async function listAgencies(db: Db, scopes: NetworkScope[], p: UserPage) {
  const like = p.q ? likePattern(p.q) : undefined;
  return db
    .select({ id: agencies.id, name: agencies.name, email: agencies.email })
    .from(agencies)
    .innerJoin(networkAgencies, eq(networkAgencies.agencyId, agencies.id))
    .where(
      and(
        inArray(networkAgencies.networkId, ids(scopes)),
        eq(networkAgencies.status, "active"),
        isNull(agencies.deletedAt),
        p.after ? sql`${agencies.id} > ${p.after}` : undefined,
        like ? or(sql`${agencies.name} ILIKE ${like}`, sql`${agencies.email} ILIKE ${like}`) : undefined,
      ),
    )
    .groupBy(agencies.id) // an agency approved in two of the admin's networks is one row
    .orderBy(asc(agencies.id))
    .limit(p.limit + 1);
}

/** The nurse's network, or null (unknown / deleted). The caller authorizes with it. */
export async function nurseNetworkId(db: Db, nurseId: string): Promise<string | null> {
  const [row] = await db
    .select({ networkId: nurseProfiles.networkId })
    .from(nurseProfiles)
    .innerJoin(users, eq(users.id, nurseProfiles.userId))
    .where(and(eq(nurseProfiles.userId, nurseId), isNull(users.deletedAt)));
  return row?.networkId ?? null;
}

/** One agency visible to the scopes, with active members and per-status shift counts (shifts inside the scoped networks only). */
export async function agencyDetail(db: Db, scopes: NetworkScope[], agencyId: string) {
  const networkIds = ids(scopes);
  const [agency] = await db
    .select({ id: agencies.id, name: agencies.name, email: agencies.email, phone: agencies.phone, city: agencies.city, state: agencies.state, status: agencies.status })
    .from(agencies)
    .innerJoin(networkAgencies, eq(networkAgencies.agencyId, agencies.id))
    .where(and(eq(agencies.id, agencyId), inArray(networkAgencies.networkId, networkIds), eq(networkAgencies.status, "active"), isNull(agencies.deletedAt)))
    .limit(1);
  if (!agency) return null;
  const [members, counts] = await Promise.all([
    db
      .select({ userId: users.id, name: userProfiles.fullName, email: users.email, role: agencyMemberships.role })
      .from(agencyMemberships)
      .innerJoin(users, eq(users.id, agencyMemberships.userId))
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(agencyMemberships.agencyId, agencyId), isNull(agencyMemberships.revokedAt), isNull(users.deletedAt)))
      .orderBy(asc(users.id)),
    db
      .select({ status: shifts.status, n: sql<number>`count(*)::int` })
      .from(shifts)
      .where(and(eq(shifts.agencyId, agencyId), inArray(shifts.networkId, networkIds), isNull(shifts.deletedAt)))
      .groupBy(shifts.status),
  ]);
  return { agency, members, counts };
}
