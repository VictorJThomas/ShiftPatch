import { randomUUID } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, isNull, type SQL, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { refreshTokens, userProfiles, users } from "../../db/schema/index.js";
import { auditScopeOf, recordAudit, type RequestMeta, type Tx } from "../audit/audit.js";
import { newRefreshToken, REFRESH_TOKEN_TTL_MS, type Role, sha256 } from "./tokens.js";

export type SessionUser = { id: string; name: string; role: Role };
export type RefreshResult =
  | { kind: "ok"; user: SessionUser; refreshToken: string }
  | { kind: "invalid" } // unknown, expired, revoked, reused, or user no longer active
  | { kind: "race" }; // lost a concurrent rotation of the same token

/**
 * A rotated token presented again within this window is treated as a concurrent refresh (two tabs, parallel 401s),
 * not theft: it gets no new token, but the family survives. After the window it is reuse -> family revoked.
 */
export const REUSE_GRACE_MS = 10_000;

// Same argon2id params as the seed, so an unknown email costs the same as a wrong password.
const dummyHash = hash("timing-equalizer, never a real password", { algorithm: 2 });

const userColumns = {
  id: users.id,
  role: users.role,
  status: users.status,
  passwordHash: users.passwordHash,
  name: userProfiles.fullName,
};
const findUser = (db: Db | Tx, where: SQL) =>
  db.select(userColumns).from(users).innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(where, isNull(users.deletedAt))).limit(1);

async function issueRefreshToken(tx: Tx, userId: string, familyId: string, meta: RequestMeta) {
  const raw = newRefreshToken();
  const id = `rt_${randomUUID()}`;
  await tx.insert(refreshTokens).values({
    id, userId, familyId, tokenHash: sha256(raw),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    userAgent: meta.userAgent, ip: meta.ip,
  });
  return { id, raw };
}

async function revokeFamily(tx: Tx, familyId: string) {
  const rows = await tx.update(refreshTokens).set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });
  return rows.length;
}

/** actor_role + network_id/agency_id for a session event (logout, reuse), same scoping as `auth.login`. No user row -> unscoped. */
async function actorAuditFields(tx: Tx, userId: string) {
  const [u] = await tx.select({ role: users.role }).from(users).where(eq(users.id, userId));
  if (!u) return {};
  return { actorRole: u.role, ...(await auditScopeOf(tx, userId, u.role)) };
}

/** `email` must already be normalized (trim + lowercase). Returns null for every failure: no hint which part was wrong. */
export async function login(db: Db, email: string, password: string, meta: RequestMeta) {
  const [u] = await findUser(db, eq(users.email, email));
  const passwordOk = await verify(u?.passwordHash ?? (await dummyHash), password).catch(() => false);
  if (!u || !passwordOk || u.status !== "active") {
    await recordAudit(db, {
      action: "auth.login_failed", entityType: "user", entityId: u?.id ?? "unknown",
      changes: { emailSha256: sha256(email) }, ...meta,
    });
    return null;
  }
  const user: SessionUser = { id: u.id, name: u.name, role: u.role };
  const refreshToken = await db.transaction(async (tx) => {
    const { raw } = await issueRefreshToken(tx, u.id, `rtf_${randomUUID()}`, meta);
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
    const scope = await auditScopeOf(tx, u.id, u.role); // same network_id / agency_id columns the shift writers fill
    await recordAudit(tx, { action: "auth.login", actorUserId: u.id, actorRole: u.role, ...scope, entityType: "user", entityId: u.id, ...meta });
    return raw;
  });
  return { user, refreshToken };
}

/**
 * Every write to a family (rotate, reuse revoke, logout) runs under this tx-scoped lock, so they serialize and each one
 * sees the others' committed rows. A row lock alone isn't enough: a revoke's UPDATE snapshot would miss a successor
 * inserted by a concurrent rotation, leaving a live token after logout / reuse detection.
 */
async function lockFamilyOf(tx: Tx, rawToken: string) {
  const hashed = eq(refreshTokens.tokenHash, sha256(rawToken));
  const [found] = await tx.select({ familyId: refreshTokens.familyId }).from(refreshTokens).where(hashed);
  if (!found) return undefined;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${found.familyId}))`);
  const [row] = await tx.select().from(refreshTokens).where(hashed); // re-read after the lock: fresh snapshot
  return row;
}

/** Rotates the refresh token. Concurrent refreshes of one token serialize on the family lock: exactly one wins. */
export function refresh(db: Db, rawToken: string, meta: RequestMeta): Promise<RefreshResult> {
  return db.transaction(async (tx): Promise<RefreshResult> => {
    const row = await lockFamilyOf(tx, rawToken);
    if (!row) return { kind: "invalid" };

    if (row.revokedAt) {
      if (!row.replacedBy) return { kind: "invalid" }; // logged out or family already revoked
      if (Date.now() - row.revokedAt.getTime() < REUSE_GRACE_MS) {
        // Race only while the family still has a live token; after logout/revocation it is plain invalid.
        const [live] = await tx.select({ id: refreshTokens.id }).from(refreshTokens)
          .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt))).limit(1);
        return live ? { kind: "race" } : { kind: "invalid" };
      }
      if ((await revokeFamily(tx, row.familyId)) > 0) {
        await recordAudit(tx, {
          action: "auth.refresh_reuse_detected", actorUserId: row.userId, ...(await actorAuditFields(tx, row.userId)),
          entityType: "refresh_token_family", entityId: row.familyId, ...meta,
        });
      }
      return { kind: "invalid" };
    }
    if (row.expiresAt.getTime() <= Date.now()) return { kind: "invalid" };

    const [u] = await findUser(tx, eq(users.id, row.userId));
    if (!u || u.status !== "active") {
      await revokeFamily(tx, row.familyId); // suspended or deleted since login
      return { kind: "invalid" };
    }

    const next = await issueRefreshToken(tx, u.id, row.familyId, meta);
    await tx.update(refreshTokens).set({ revokedAt: new Date(), replacedBy: next.id }).where(eq(refreshTokens.id, row.id));
    return { kind: "ok", user: { id: u.id, name: u.name, role: u.role }, refreshToken: next.raw };
  });
}

/** Revokes the token's whole family. Idempotent: unknown or already-revoked tokens are a no-op (no duplicate audit). */
export async function logout(db: Db, rawToken: string, meta: RequestMeta) {
  await db.transaction(async (tx) => {
    const row = await lockFamilyOf(tx, rawToken);
    if (!row || (await revokeFamily(tx, row.familyId)) === 0) return;
    await recordAudit(tx, { action: "auth.logout", actorUserId: row.userId, ...(await actorAuditFields(tx, row.userId)), entityType: "refresh_token_family", entityId: row.familyId, ...meta });
  });
}
