import { and, desc, eq, gte, inArray, lt, lte, type SQL } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { auditLog } from "../../db/schema/index.js";
import { type AgencyScope, assertAgencyScope, assertNetworkScope, type NetworkScope } from "../authz/scope.js";

// Read-only on purpose: the audit log is append-only. Writes live in audit.ts (insert only); nothing here or there updates or deletes.

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

export interface AuditFilter {
  entityType?: string;
  entityId?: string;
  action?: string;
  /** Narrows inside the caller's scope (ANDed with it), so it can never widen it: a foreign agency yields an empty page. */
  agencyId?: string;
  from?: Date;
  to?: Date;
  /** Keyset position: only rows with a smaller id (newest first). */
  before?: number;
  limit: number;
}

/** Newest first by id (identity, so unique and stable under equal timestamps). Fetches limit+1 so the caller can tell if there is a next page. */
async function page(db: Db, scopeWhere: SQL, f: AuditFilter) {
  const where = and(
    scopeWhere,
    f.entityType ? eq(auditLog.entityType, f.entityType) : undefined,
    f.entityId ? eq(auditLog.entityId, f.entityId) : undefined,
    f.action ? eq(auditLog.action, f.action) : undefined,
    f.agencyId ? eq(auditLog.agencyId, f.agencyId) : undefined,
    f.from ? gte(auditLog.occurredAt, f.from) : undefined,
    f.to ? lte(auditLog.occurredAt, f.to) : undefined,
    f.before !== undefined ? lt(auditLog.id, f.before) : undefined,
  );
  return db.select().from(auditLog).where(where).orderBy(desc(auditLog.id)).limit(f.limit + 1);
}

export function queryByAgency(db: Db, scope: AgencyScope, f: AuditFilter) {
  assertAgencyScope(scope);
  return page(db, inArray(auditLog.agencyId, [...scope.agencyIds]), f);
}

/** One or more networks the caller administers. Empty list = nothing (never "all"). */
export function queryByNetworks(db: Db, scopes: readonly NetworkScope[], f: AuditFilter) {
  for (const s of scopes) assertNetworkScope(s);
  return page(db, inArray(auditLog.networkId, scopes.map((s) => s.networkId)), f);
}
