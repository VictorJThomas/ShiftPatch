import type { Actor } from "../authz/actor.js";
import { agencyWrite, allow, type Decision, deny, isAdminOf, membershipRoleIn } from "../authz/decision.js";

export interface MembershipResource { agencyId: string; networkId: string }

export type MembershipAction = "membership:read" | "membership:manage";
export interface MembershipResources { "membership:read": MembershipResource; "membership:manage": MembershipResource }

// ARCHITECTURE §4.5/§7.1: owners of that agency, and admins of its network. Managers and viewers never.
export const membershipPolicy: { [A in MembershipAction]: (actor: Actor, r: MembershipResources[A]) => Decision } = {
  "membership:read": (actor, r) => {
    if (isAdminOf(actor, r.networkId)) return allow;
    if (actor.role === "admin") return deny("not_a_member");
    if (actor.role !== "agency") return deny("role_not_permitted");
    const role = membershipRoleIn(actor, r.agencyId);
    if (!role) return deny("not_a_member");
    return role === "owner" ? allow : deny("insufficient_membership_role");
  },
  "membership:manage": (actor, r) => (isAdminOf(actor, r.networkId) ? allow : agencyWrite(actor, r.agencyId, ["owner"])),
};
