import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { notifications } from "../../db/schema/index.js";
import type { Tx } from "../audit/audit.js";
import type { Recipient } from "./recipients.js";

/**
 * Outbox insert (ARCHITECTURE §10): call inside the business transaction, so a failed insert rolls the action back. One row per
 * distinct recipient, never the actor. With `dedupeKey` a repeated key is skipped (reminder sweep idempotency). Returns rows inserted.
 */
export async function enqueue(
  q: Db | Tx,
  a: { template: string; payload: Record<string, unknown>; recipients: (Recipient | null)[]; excludeUserId?: string; dedupeKey?: (r: Recipient) => string },
): Promise<number> {
  const unique = new Map<string, Recipient>();
  for (const r of a.recipients) if (r && r.userId !== a.excludeUserId) unique.set(r.userId, r);
  if (!unique.size) return 0;
  const rows = [...unique.values()].map((r) => ({
    id: `ntf_${randomUUID()}`, recipientUserId: r.userId, recipientEmail: r.email, template: a.template, payload: a.payload, dedupeKey: a.dedupeKey?.(r) ?? null,
  }));
  const insert = q.insert(notifications).values(rows);
  const done = a.dedupeKey
    ? await insert.onConflictDoNothing({ target: notifications.dedupeKey, where: sql`dedupe_key IS NOT NULL` }).returning({ id: notifications.id })
    : await insert.returning({ id: notifications.id });
  return done.length;
}
