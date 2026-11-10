import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { agencyMemberships, credentials, networkMemberships, nurseProfiles, userProfiles, users } from "../../db/schema/index.js";
import type { Tx } from "../audit/audit.js";
import { isEligible, roleMatchesLicense } from "../shifts/eligibility.js";

// Who gets which email (ARCHITECTURE §10). Every query keeps only active, non-deleted users.

type Q = Db | Tx;
export type Recipient = { userId: string; email: string };
const liveUser = [eq(users.status, "active"), isNull(users.deletedAt)] as const;

/** Active owners/managers of the agency (viewers get nothing). */
export const agencyManagers = (q: Q, agencyId: string): Promise<Recipient[]> =>
  q.select({ userId: users.id, email: users.email })
    .from(agencyMemberships)
    .innerJoin(users, eq(users.id, agencyMemberships.userId))
    .where(and(eq(agencyMemberships.agencyId, agencyId), isNull(agencyMemberships.revokedAt), inArray(agencyMemberships.role, ["owner", "manager"]), ...liveUser));

/** Admins with an active membership in the network. */
export const networkAdmins = (q: Q, networkId: string): Promise<Recipient[]> =>
  q.select({ userId: users.id, email: users.email })
    .from(networkMemberships)
    .innerJoin(users, eq(users.id, networkMemberships.userId))
    .where(and(eq(networkMemberships.networkId, networkId), isNull(networkMemberships.revokedAt), eq(users.role, "admin"), ...liveUser));

/** Nurses of the network who could claim this shift: license type matches the role and a license covers `today` and the shift day. */
export async function eligibleNurses(q: Q, networkId: string, role: string, shiftDate: string, today: string): Promise<Recipient[]> {
  const nurses = await q
    .select({ userId: users.id, email: users.email, licenseType: nurseProfiles.licenseType })
    .from(nurseProfiles)
    .innerJoin(users, eq(users.id, nurseProfiles.userId))
    .where(and(eq(nurseProfiles.networkId, networkId), ...liveUser));
  const matching = nurses.filter((n) => roleMatchesLicense(n.licenseType, role));
  if (!matching.length) return [];
  const licenses = await q
    .select({ nurseId: credentials.nurseId, status: credentials.status, expiresOn: credentials.expiresOn })
    .from(credentials)
    .where(and(inArray(credentials.nurseId, matching.map((n) => n.userId)), eq(credentials.type, "license"), isNull(credentials.deletedAt)));
  return matching
    .filter((n) => isEligible(licenses.filter((l) => l.nurseId === n.userId), { shiftDate }, today))
    .map(({ userId, email }) => ({ userId, email }));
}

export async function userRecipient(q: Q, userId: string): Promise<Recipient | null> {
  const [row] = await q.select({ userId: users.id, email: users.email }).from(users).where(and(eq(users.id, userId), ...liveUser));
  return row ?? null;
}

export async function userName(q: Q, userId: string): Promise<string> {
  const [row] = await q.select({ name: userProfiles.fullName }).from(userProfiles).where(eq(userProfiles.userId, userId));
  return row?.name ?? "A nurse";
}
