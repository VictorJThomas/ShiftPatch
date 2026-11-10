import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { agencies, agencyMemberships, auditLog, hospitalNetworks, networkAgencies, networkMemberships, nurseProfiles } from "../../db/schema/index.js";
import { redactChanges } from "./redact.js";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** The audit action catalog (ARCHITECTURE §11). */
export type AuditAction =
  | "auth.login" | "auth.login_failed" | "auth.refresh_reuse_detected" | "auth.logout"
  | "shift.created" | "shift.claimed" | "shift.cancelled" | "shift.withdrawn" | "shift.unassigned" | "shift.deleted"
  | "credential.uploaded" | "credential.reviewed" | "credential.document_viewed"
  | "agency.updated" | "membership.granted" | "membership.revoked"
  | "access.denied";
export type AuditEntry = Omit<typeof auditLog.$inferInsert, "action"> & { action: AuditAction };
/** Request context copied onto every audit row (ARCHITECTURE §11: request ID links audit rows to logs). */
export type RequestMeta = Pick<AuditEntry, "requestId" | "ip" | "userAgent">;

/**
 * Append one audit row. Pass the transaction that makes the change, so both commit or roll back together.
 * `changes` is redacted here (passwords, tokens, links, object keys), so no writer can store them by mistake.
 * Write-only by design: this module exposes no update or delete (the table also has a trigger that blocks both).
 */
export async function recordAudit(db: Db | Tx, entry: AuditEntry) {
  await db.insert(auditLog).values({ ...entry, changes: entry.changes === undefined ? undefined : redactChanges(entry.changes) });
}

/**
 * The `network_id` / `agency_id` columns for an event that has no shift to take them from (login). Same columns the shift
 * writers fill, so GET /api/audit-logs scopes every row one way. Ambiguous = null: an agency user with several memberships has
 * no single active agency at login, an admin with several networks no single network; such a row is unscoped (visible to nobody).
 */
export async function auditScopeOf(db: Db | Tx, userId: string, role: "agency" | "nurse" | "admin"): Promise<{ networkId: string | null; agencyId: string | null }> {
  const none = { networkId: null, agencyId: null };
  if (role === "nurse") {
    const [n] = await db.select({ networkId: nurseProfiles.networkId }).from(nurseProfiles).where(eq(nurseProfiles.userId, userId));
    return { networkId: n?.networkId ?? null, agencyId: null };
  }
  if (role === "admin") { // same filters as loadActorFor: active membership in a live, active network
    const rows = await db.select({ networkId: networkMemberships.networkId }).from(networkMemberships)
      .innerJoin(hospitalNetworks, eq(hospitalNetworks.id, networkMemberships.networkId))
      .where(and(eq(networkMemberships.userId, userId), isNull(networkMemberships.revokedAt), isNull(hospitalNetworks.deletedAt), eq(hospitalNetworks.status, "active")));
    return rows.length === 1 ? { networkId: rows[0]!.networkId, agencyId: null } : none;
  }
  const mine = await db.select({ agencyId: agencyMemberships.agencyId }).from(agencyMemberships)
    .innerJoin(agencies, eq(agencies.id, agencyMemberships.agencyId))
    .where(and(eq(agencyMemberships.userId, userId), isNull(agencyMemberships.revokedAt), isNull(agencies.deletedAt), eq(agencies.status, "active")));
  if (mine.length !== 1) return none;
  const agencyId = mine[0]!.agencyId;
  const nets = await db.select({ networkId: networkAgencies.networkId }).from(networkAgencies)
    .where(and(eq(networkAgencies.agencyId, agencyId), eq(networkAgencies.status, "active")));
  return { networkId: nets.length === 1 ? nets[0]!.networkId : null, agencyId };
}
