import type { AuditLogQuery, AuditLogResponse } from "@shiftpatch/contracts";
import type { Db } from "../../db/client.js";
import type { auditLog } from "../../db/schema/index.js";
import type { Actor } from "../authz/actor.js";
import { can } from "../authz/can.js";
import { type Decision, deny } from "../authz/decision.js";
import { type AgencyScope, agencyScope, type NetworkScope, networkScope } from "../authz/scope.js";
import { redactChanges } from "./redact.js";
import * as repo from "./repository.js";

export type AuditResult = { ok: true; value: AuditLogResponse } | { ok: false; invalid: string };

const DEFAULT_LIMIT = 50;
const encodeCursor = (id: number) => Buffer.from(String(id)).toString("base64url");
function decodeCursor(cursor: string): number | null {
  const text = Buffer.from(cursor, "base64url").toString();
  return /^[1-9]\d{0,15}$/.test(text) && encodeCursor(Number(text)) === cursor ? Number(text) : null; // canonical only: no padding / junk variants
}

const toEntry = (r: typeof auditLog.$inferSelect): AuditLogResponse["items"][number] => ({
  id: String(r.id),
  occurredAt: r.occurredAt.toISOString(),
  actorUserId: r.actorUserId,
  actorRole: r.actorRole,
  networkId: r.networkId,
  agencyId: r.agencyId,
  action: r.action,
  entityType: r.entityType,
  entityId: r.entityId,
  changes: redactChanges(r.changes), // rows written by any writer, old or new, are scrubbed again on the way out
  requestId: r.requestId,
});

export type AuditScope = { kind: "network"; scopes: NetworkScope[] } | { kind: "agency"; scope: AgencyScope };
export type Authorized = { ok: true; scope: AuditScope } | { ok: false; denied: Decision & { allow: false } };

/**
 * Who may read, and which rows. Runs BEFORE any query validation, so a caller without access gets 403 / 400 "Select an agency"
 * whatever they send. Scope comes from the actor, never from the query: admin = every network they actively administer,
 * agency = the validated active agency. Nurses and agency viewers are denied by `can("audit:read")`.
 */
export function authorizeAuditRead(actor: Actor): Authorized {
  const no = (d: Decision): Authorized => ({ ok: false, denied: d as Decision & { allow: false } });
  if (actor.role === "admin") {
    if (actor.networkIds.length === 0) return no(can(actor, "audit:read", { agencyId: null, networkId: "" })); // no active network: not_a_member
    const scopes: NetworkScope[] = [];
    for (const networkId of actor.networkIds) {
      const decision = can(actor, "audit:read", { agencyId: null, networkId });
      if (!decision.allow) return no(decision);
      scopes.push(networkScope(actor, networkId));
    }
    return { ok: true, scope: { kind: "network", scopes } };
  }
  if (actor.role === "agency") {
    const agencyId = actor.activeAgencyId;
    if (agencyId === null) return no(deny(actor.agencies.length > 0 ? "agency_selection_required" : "not_a_member"));
    const decision = can(actor, "audit:read", { agencyId, networkId: null });
    if (!decision.allow) return no(decision);
    return { ok: true, scope: { kind: "agency", scope: agencyScope(actor, agencyId) } };
  }
  return no(can(actor, "audit:read", { agencyId: null, networkId: null })); // nurse: role_not_permitted
}

/** GET /api/audit-logs, after `authorizeAuditRead`. `q` is already shape-validated; the range and the cursor are checked here. */
export async function listAuditLogs(db: Db, scope: AuditScope, q: AuditLogQuery): Promise<AuditResult> {
  if (q.from && q.to && new Date(q.from) > new Date(q.to)) return { ok: false, invalid: "Invalid query" };
  let before: number | undefined;
  if (q.cursor !== undefined) {
    const decoded = decodeCursor(q.cursor); // not a capability: scope is applied independently of it
    if (decoded === null) return { ok: false, invalid: "Invalid query" };
    before = decoded;
  }
  const limit = q.limit ?? DEFAULT_LIMIT;
  const filter: repo.AuditFilter = {
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.from ? { from: new Date(q.from) } : {}),
    ...(q.to ? { to: new Date(q.to) } : {}),
    ...(before !== undefined ? { before } : {}),
    limit,
  };
  const rows = scope.kind === "network" ? await repo.queryByNetworks(db, scope.scopes, filter) : await repo.queryByAgency(db, scope.scope, filter);
  const hasMore = rows.length > limit;
  return { ok: true, value: { items: rows.slice(0, limit).map(toEntry), nextCursor: hasMore ? encodeCursor(rows[limit - 1]!.id) : null } };
}
