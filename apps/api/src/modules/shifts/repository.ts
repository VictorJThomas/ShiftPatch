import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { shifts } from "../../db/schema/index.js";
import { type AgencyScope, assertAgencyScope, assertNetworkScope, type NetworkScope } from "../authz/scope.js";

// Tenant data: every query takes a scope object that only the authorization layer can issue. No unscoped variant exists.

export async function listByAgency(db: Db, scope: AgencyScope) {
  assertAgencyScope(scope);
  return db.select().from(shifts).where(and(inArray(shifts.agencyId, [...scope.agencyIds]), isNull(shifts.deletedAt)));
}

/** Admin reporting: one network's shifts across all its agencies. */
export async function listByNetwork(db: Db, scope: NetworkScope) {
  assertNetworkScope(scope);
  return db.select().from(shifts).where(and(eq(shifts.networkId, scope.networkId), isNull(shifts.deletedAt)));
}
