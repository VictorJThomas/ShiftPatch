import { ErrorMessage } from "@shiftpatch/contracts";
import type { Actor, MembershipRole } from "./actor.js";

export type DenyReason =
  | "role_not_permitted" // layer 1: global role
  | "not_a_member" // layer 2: no active membership in the target agency / network
  | "insufficient_membership_role" // layer 2: member, but the role (e.g. viewer) can't do this
  | "agency_selection_required" // multi-agency user, write without X-Agency-Id
  | "out_of_scope" // layer 3: resource outside the caller's scope (hidden: 404)
  | "resource_rule"; // layer 3: owner/assignee rule failed

export type Decision = { readonly allow: true } | { readonly allow: false; readonly reason: DenyReason };

export const allow: Decision = { allow: true };
export const deny = (reason: DenyReason): Decision => ({ allow: false, reason });

/** HTTP mapping for a denial (ARCHITECTURE §7.2): 400 select agency, 404 hidden record, else 403. */
export function denialResponse(reason: DenyReason): { status: 400 | 403 | 404; body: { error: string } } {
  if (reason === "agency_selection_required") return { status: 400, body: { error: ErrorMessage.agencyRequired } };
  if (reason === "out_of_scope") return { status: 404, body: { error: "Not found" } };
  return { status: 403, body: { error: ErrorMessage.forbidden } };
}

export const isAdminOf = (actor: Actor, networkId: string) => actor.role === "admin" && actor.networkIds.includes(networkId);

/** Role the actor holds in `agencyId`. Agency memberships only count for the global role `agency` (loadActor enforces it too). */
export const membershipRoleIn = (actor: Actor, agencyId: string): MembershipRole | null =>
  actor.role === "agency" ? (actor.agencies.find((m) => m.agencyId === agencyId)?.role ?? null) : null;

/**
 * Write-style agency action: needs an explicit active agency that equals the target and a membership role in `roles`.
 * `X-Agency-Id` never grants anything: membership is looked up from the actor's DB-loaded memberships.
 */
export function agencyWrite(actor: Actor, agencyId: string | null, roles: readonly MembershipRole[]): Decision {
  if (actor.role !== "agency") return deny("role_not_permitted");
  if (agencyId !== null && !membershipRoleIn(actor, agencyId)) return deny("not_a_member"); // never ask a stranger to "select"
  if (actor.activeAgencyId === null) return deny("agency_selection_required");
  const target = agencyId ?? actor.activeAgencyId;
  if (target !== actor.activeAgencyId) return deny("not_a_member");
  const role = membershipRoleIn(actor, target);
  if (!role) return deny("not_a_member");
  return roles.includes(role) ? allow : deny("insufficient_membership_role");
}
