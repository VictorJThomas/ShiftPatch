import type { Actor } from "../authz/actor.js";
import { agencyWrite, allow, type Decision, deny, isAdminOf, membershipRoleIn } from "../authz/decision.js";

export interface AgencyShiftResource { agencyId: string; networkId: string }
export interface CreateShiftResource { agencyId: string | null } // null = caller has no active agency yet
export interface CancelShiftResource extends AgencyShiftResource { claimedBy: string | null; reason: "no-show" | "advance" }
export interface ClaimShiftResource { networkId: string }
export type ListMatchableResource = Record<string, never>; // no resource: the nurse is the actor

export type ShiftAction = "shift:read-agency" | "shift:create" | "shift:manage" | "shift:cancel" | "shift:claim" | "shift:list-matchable" | "shift:list-mine";
export interface ShiftResources {
  "shift:read-agency": AgencyShiftResource;
  "shift:create": CreateShiftResource;
  "shift:manage": AgencyShiftResource;
  "shift:cancel": CancelShiftResource;
  "shift:claim": ClaimShiftResource;
  "shift:list-matchable": ListMatchableResource;
  "shift:list-mine": ListMatchableResource;
}

const WRITERS = ["owner", "manager"] as const;

export const shiftPolicy: { [A in ShiftAction]: (actor: Actor, r: ShiftResources[A]) => Decision } = {
  // GET /api/agencies/:agencyId/shifts: any member (viewer included) of that agency, or an admin of its network.
  "shift:read-agency": (actor, r) => {
    if (isAdminOf(actor, r.networkId)) return allow;
    if (actor.role === "admin") return deny("not_a_member");
    if (actor.role !== "agency") return deny("role_not_permitted");
    return membershipRoleIn(actor, r.agencyId) ? allow : deny("not_a_member");
  },
  // Admins have no agency to post for.
  // No active membership at all (e.g. revoked) is a plain 403, not "Select an agency": there is nothing to select.
  "shift:create": (actor, r) => (actor.role === "agency" && actor.agencies.length === 0 ? deny("not_a_member") : agencyWrite(actor, r.agencyId, WRITERS)),
  "shift:manage": (actor, r) => (isAdminOf(actor, r.networkId) ? allow : agencyWrite(actor, r.agencyId, WRITERS)),
  "shift:cancel": (actor, r) => {
    if (actor.role === "nurse") {
      // Nurse: only the shift they hold, only with advance notice (ARCHITECTURE §7.1 layer 3).
      return r.claimedBy === actor.userId && r.reason === "advance" ? allow : deny("resource_rule");
    }
    return isAdminOf(actor, r.networkId) ? allow : agencyWrite(actor, r.agencyId, WRITERS);
  },
  // Nurses claim across every agency of their network roster (C6). Credential eligibility is the service's job (§5.3).
  "shift:claim": (actor, r) => {
    if (actor.role !== "nurse") return deny("role_not_permitted");
    return actor.nurseNetworkId !== null && actor.nurseNetworkId === r.networkId ? allow : deny("out_of_scope");
  },
  // GET /api/shifts?matchable=true: nurse-only discovery view (ARCHITECTURE §8.3). The plain list needs no policy: any authenticated user.
  "shift:list-matchable": (actor) => (actor.role === "nurse" && actor.nurseNetworkId !== null ? allow : deny("role_not_permitted")),
  // GET /api/nurses/me/shifts: the nurse's own history. Nurse-only; the data is keyed on the actor's id, never on input.
  "shift:list-mine": (actor) => (actor.role === "nurse" ? allow : deny("role_not_permitted")),
};
