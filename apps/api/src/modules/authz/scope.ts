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

/**
 * The full marketplace (GET /api/shifts is cross-agency by spec): every non-deleted shift, or one network's when `networkId` is set.
 * Obtainable solely from `marketplaceScope()` (any authenticated actor) / `matchableScope()` (a nurse, own network).
 */
export interface MarketplaceScope { readonly [brand]: "marketplace"; readonly networkId: string | null }

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

/** All-network read for any authenticated actor. The spec makes the plain list public to every role. */
export function marketplaceScope(actor: Actor): MarketplaceScope {
  if (actor.status !== "active") throw new Error("marketplaceScope: inactive actor");
  return issue({ networkId: null } as unknown as MarketplaceScope);
}

/** A nurse's own-network view (`?matchable=true`). */
export function matchableScope(actor: Actor): MarketplaceScope {
  if (actor.role !== "nurse" || actor.nurseNetworkId === null) throw new Error("matchableScope: actor is not a nurse with a network");
  return issue({ networkId: actor.nurseNetworkId } as unknown as MarketplaceScope);
}

export function assertMarketplaceScope(scope: MarketplaceScope): asserts scope is MarketplaceScope {
  if (!issued.has(scope)) throw new Error("repository called with a forged marketplace scope");
}
export function assertAgencyScope(scope: AgencyScope): asserts scope is AgencyScope {
  if (!issued.has(scope)) throw new Error("repository called with a forged agency scope");
}
export function assertNetworkScope(scope: NetworkScope): asserts scope is NetworkScope {
  if (!issued.has(scope)) throw new Error("repository called with a forged network scope");
}
