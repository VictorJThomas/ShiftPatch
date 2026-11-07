import type { Db } from "../../db/client.js";
import { auditLog } from "../../db/schema/index.js";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type AuditEntry = typeof auditLog.$inferInsert;
/** Request context copied onto every audit row (ARCHITECTURE §11: request ID links audit rows to logs). */
export type RequestMeta = Pick<AuditEntry, "requestId" | "ip" | "userAgent">;

/**
 * Append one audit row. Pass the transaction that makes the change, so both commit or roll back together.
 * Never put passwords, tokens or raw emails in `changes`.
 */
export async function recordAudit(db: Db | Tx, entry: AuditEntry) {
  await db.insert(auditLog).values(entry);
}
