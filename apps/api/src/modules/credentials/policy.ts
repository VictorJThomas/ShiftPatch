import type { Actor } from "../authz/actor.js";
import { allow, type Decision, deny, isAdminOf, membershipRoleIn } from "../authz/decision.js";

export interface CredentialResource {
  nurseId: string;
  nurseNetworkId: string;
  /** Agencies where this nurse currently holds a shift (status filled). Computed by the caller from the DB. */
  agencyIdsHoldingNurse: readonly string[];
}

export type CredentialAction = "credential:read-metadata" | "credential:read-document" | "credential:manage-own";
export interface CredentialResources {
  "credential:read-metadata": CredentialResource;
  "credential:read-document": CredentialResource;
  "credential:manage-own": Record<string, never>;
}

// ARCHITECTURE §4.5/§7.1: the nurse, admins of the nurse's network, and an agency only while the nurse holds one of its shifts.
// Everything else is `out_of_scope` -> 404, so a record's existence is not revealed.
function readCredentials(actor: Actor, r: CredentialResource): Decision {
  if (actor.role === "nurse") return actor.userId === r.nurseId ? allow : deny("out_of_scope");
  if (isAdminOf(actor, r.nurseNetworkId)) return allow;
  if (actor.role === "agency") {
    // Reads need no agency selection; when X-Agency-Id is present it narrows to that agency.
    const ids = actor.activeAgencyId !== null ? [actor.activeAgencyId] : actor.agencies.map((m) => m.agencyId);
    const entitled = ids.some((id) => {
      const role = membershipRoleIn(actor, id);
      return r.agencyIdsHoldingNurse.includes(id) && (role === "owner" || role === "manager");
    });
    if (entitled) return allow;
  }
  return deny("out_of_scope");
}

export const credentialPolicy: { [A in CredentialAction]: (actor: Actor, r: CredentialResources[A]) => Decision } = {
  "credential:read-metadata": readCredentials,
  "credential:read-document": readCredentials,
  // GET/POST /api/nurses/me/credentials: nurse-only, keyed on the actor's id (never on input), so no resource to check.
  "credential:manage-own": (actor) => (actor.role === "nurse" ? allow : deny("role_not_permitted")),
};
