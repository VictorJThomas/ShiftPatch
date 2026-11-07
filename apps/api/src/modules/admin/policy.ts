import type { Actor } from "../authz/actor.js";
import { allow, type Decision, deny, isAdminOf } from "../authz/decision.js";

export interface NetworkResource { networkId: string }

export type AdminAction = "admin:network";
export interface AdminResources { "admin:network": NetworkResource }

/** Network-level operations (reports, credential review, roster): admins, only inside networks they actively belong to. */
export const adminPolicy: { [A in AdminAction]: (actor: Actor, r: AdminResources[A]) => Decision } = {
  "admin:network": (actor, r) => {
    if (actor.role !== "admin") return deny("role_not_permitted");
    return isAdminOf(actor, r.networkId) ? allow : deny("not_a_member");
  },
};
