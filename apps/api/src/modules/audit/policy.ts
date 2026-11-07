import type { Actor } from "../authz/actor.js";
import { allow, type Decision, deny, isAdminOf, membershipRoleIn } from "../authz/decision.js";

/** `agencyId: null` asks for the whole network's log (admin only); otherwise one agency's rows. */
export interface AuditReadResource { agencyId: string | null; networkId: string | null }

export type AuditAction = "audit:read";
export interface AuditResources { "audit:read": AuditReadResource }

// ARCHITECTURE §4.5: admin = whole network, agency = its own rows. Viewers are excluded (least privilege; the matrix lists
// viewers for "view agency shifts" only).
export const auditPolicy: { [A in AuditAction]: (actor: Actor, r: AuditResources[A]) => Decision } = {
  "audit:read": (actor, r) => {
    if (r.networkId !== null && isAdminOf(actor, r.networkId)) return allow;
    if (actor.role === "admin") return deny("not_a_member");
    if (actor.role !== "agency") return deny("role_not_permitted");
    if (r.agencyId === null) return deny("role_not_permitted"); // network-wide log is admin-only
    const role = membershipRoleIn(actor, r.agencyId);
    if (!role) return deny("not_a_member");
    return role === "viewer" ? deny("insufficient_membership_role") : allow;
  },
};
