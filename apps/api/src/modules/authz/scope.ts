import type { Actor } from "./actor.js";
import { isAdminOf, membershipRoleIn } from "./decision.js";

declare const brand: unique symbol;
/**
 * Rows of these agencies only. Obtainable solely from `agencyScope()` / `agencyScopeForAdmin()`.
 * A scope proves membership, NOT that `can()` allowed the action (e.g. a viewer can get one): handlers must run `can()` first.
 */
export interface AgencyScope { readonly [brand]: "agency"; readonly agencyIds: readonly string[] }
/** Rows of one hospital network only. Obtainable solely from `networkScope()`. */
export interface NetworkScope { readonly [brand]: "network"; readonly networkId: string }

// Runtime twin of the compile-time brand: a forged object (cast, JS caller) is rejected by `assert*`.
const issued = new WeakSet<object>();
const issue = <T extends object>(scope: T): T => (issued.add(scope), Object.freeze(scope));

/** Scope for one agency the actor actively belongs to. Throws otherwise: authorization must have run first. */
export function agencyScope(actor: Actor, agencyId: string): AgencyScope {
  if (!membershipRoleIn(actor, agencyId)) throw new Error("agencyScope: actor is not a member of the agency");
  return issue({ agencyIds: [agencyId] } as unknown as AgencyScope);
}

/**
 * Scope for ONE agency, for an admin of the network the agency belongs to (GET /api/agencies/:id/shifts must give admins 200).
 * `agencyNetworkId` must come from the agency's DB row, never from client input.
 */
export function agencyScopeForAdmin(actor: Actor, agencyId: string, agencyNetworkId: string): AgencyScope {
  if (!isAdminOf(actor, agencyNetworkId)) throw new Error("agencyScopeForAdmin: actor is not an admin of the agency's network");
  return issue({ agencyIds: [agencyId] } as unknown as AgencyScope);
}

/** Scope for a network the actor administers. Throws otherwise. */
export function networkScope(actor: Actor, networkId: string): NetworkScope {
  if (!isAdminOf(actor, networkId)) throw new Error("networkScope: actor is not an admin of the network");
  return issue({ networkId } as unknown as NetworkScope);
}

export function assertAgencyScope(scope: AgencyScope): asserts scope is AgencyScope {
  if (!issued.has(scope)) throw new Error("repository called with a forged agency scope");
}
export function assertNetworkScope(scope: NetworkScope): asserts scope is NetworkScope {
  if (!issued.has(scope)) throw new Error("repository called with a forged network scope");
}
