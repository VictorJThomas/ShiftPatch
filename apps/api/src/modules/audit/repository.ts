import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { auditLog } from "../../db/schema/index.js";
import { type AgencyScope, assertAgencyScope, assertNetworkScope, type NetworkScope } from "../authz/scope.js";

/** An agency reads only the rows carrying its agency_id (ARCHITECTURE §4.5). */
export async function listByAgency(db: Db, scope: AgencyScope, limit = 100) {
  assertAgencyScope(scope);
  return db.select().from(auditLog).where(inArray(auditLog.agencyId, [...scope.agencyIds])).orderBy(desc(auditLog.occurredAt)).limit(limit);
}

/** Admin: the whole network's log. */
export async function listByNetwork(db: Db, scope: NetworkScope, limit = 100) {
  assertNetworkScope(scope);
  return db.select().from(auditLog).where(eq(auditLog.networkId, scope.networkId)).orderBy(desc(auditLog.occurredAt)).limit(limit);
}
