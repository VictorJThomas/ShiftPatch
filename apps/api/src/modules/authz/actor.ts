import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { agencies, agencyMemberships, hospitalNetworks, networkMemberships, nurseProfiles, users } from "../../db/schema/index.js";

export type GlobalRole = "agency" | "nurse" | "admin";
export type MembershipRole = "owner" | "manager" | "viewer";

/** Result of `authenticate`: the verified, DB-confirmed identity. Nothing from the JWT but `sub`/`role`/`jti` is used. */
export interface AuthContext {
  readonly userId: string;
  readonly role: GlobalRole;
  readonly nurseNetworkId: string | null;
}

/** Minimum the policies and services need. Rebuilt from the database on every request, never cached or put in the JWT. */
export interface Actor {
  readonly userId: string;
  readonly role: GlobalRole; // single primary global role (MVP)
  readonly status: "active"; // suspended / deleted users never get an actor
  readonly agencies: readonly { readonly agencyId: string; readonly role: MembershipRole }[]; // active memberships, agency role only
  readonly networkIds: readonly string[]; // active network memberships, admin role only
  readonly nurseNetworkId: string | null; // a nurse's roster network (claim scope)
  readonly activeAgencyId: string | null; // from X-Agency-Id (validated) or the single membership; null = must select
}

/** X-Agency-Id names an agency the user does not actively belong to (or is malformed). Maps to 403. */
export class AgencyHeaderError extends Error {}

/** Verified user row, or null when the account may not authenticate (missing, deleted, suspended, inactive nurse). */
export async function findActiveUser(db: Db, userId: string, tokenRole: GlobalRole): Promise<AuthContext | null> {
  const [row] = await db
    .select({ role: users.role, status: users.status, nurseStatus: nurseProfiles.status, nurseNetworkId: nurseProfiles.networkId })
    .from(users)
    .leftJoin(nurseProfiles, eq(nurseProfiles.userId, users.id))
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  if (!row || row.status !== "active") return null;
  if (row.role !== tokenRole) return null; // stale role claim = invalid session
  if (row.role === "nurse" && row.nurseStatus === "inactive") return null;
  return { userId, role: row.role, nurseNetworkId: row.nurseNetworkId ?? null };
}

/** Loads current memberships and resolves the active agency. `header` is untrusted input. */
export async function loadActorFor(db: Db, auth: AuthContext, header: string | string[] | undefined): Promise<Actor> {
  const [agencyRows, networkRows] = await Promise.all([
    auth.role === "agency"
      ? db
          .select({ agencyId: agencyMemberships.agencyId, role: agencyMemberships.role })
          .from(agencyMemberships)
          .innerJoin(agencies, eq(agencies.id, agencyMemberships.agencyId))
          .where(
            and(
              eq(agencyMemberships.userId, auth.userId),
              isNull(agencyMemberships.revokedAt),
              isNull(agencies.deletedAt),
              eq(agencies.status, "active"),
            ),
          )
      : [],
    auth.role === "admin"
      ? db
          .select({ networkId: networkMemberships.networkId })
          .from(networkMemberships)
          .innerJoin(hospitalNetworks, eq(hospitalNetworks.id, networkMemberships.networkId))
          .where(
            and(
              eq(networkMemberships.userId, auth.userId),
              isNull(networkMemberships.revokedAt),
              isNull(hospitalNetworks.deletedAt),
              eq(hospitalNetworks.status, "active"),
            ),
          )
      : [],
  ]);

  let activeAgencyId: string | null = null;
  if (header !== undefined) {
    // Untrusted: must be exactly one non-empty value naming an active membership. Duplicates arrive joined ("a, b") and fail the lookup.
    if (typeof header !== "string" || !agencyRows.some((m) => m.agencyId === header)) throw new AgencyHeaderError();
    activeAgencyId = header;
  } else if (agencyRows.length === 1) {
    activeAgencyId = agencyRows[0]!.agencyId;
  }

  return Object.freeze({
    userId: auth.userId,
    role: auth.role,
    status: "active",
    agencies: Object.freeze(agencyRows.map((m) => Object.freeze({ agencyId: m.agencyId, role: m.role }))),
    networkIds: Object.freeze(networkRows.map((n) => n.networkId)),
    nurseNetworkId: auth.nurseNetworkId,
    activeAgencyId,
  });
}
