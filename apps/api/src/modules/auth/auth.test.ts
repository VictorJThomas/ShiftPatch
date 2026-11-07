// Auth lifecycle against a real throwaway Postgres: login, JWT, refresh rotation, reuse detection, logout, limits.
import { hash } from "@node-rs/argon2";
import { ErrorBody, ErrorMessage, LoginResponse } from "@shiftpatch/contracts";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { decodeJwt, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { auditLog, refreshTokens, userProfiles, users } from "../../db/schema/index.js";
import { seed } from "../../db/seed.js";
import { createTestDb } from "../../db/test-db.js";
import { REFRESH_COOKIE, sha256, verifyAccessToken } from "./tokens.js";

const PASSWORD = "Trial2026!";
let t: Awaited<ReturnType<typeof createTestDb>>;
let app: FastifyInstance;
let passwordHash: string;

beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db);
  passwordHash = await hash(PASSWORD, { algorithm: 2 });
  process.env.DATABASE_URL = t.url;
  app = buildApp();
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await t?.drop();
});

// Unique client IP per call site, so the in-memory rate limiter only bites in the rate-limit tests.
let ipSeq = 0;
const newIp = () => `10.0.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;

let userSeq = 0;
/** Fresh user per test: tests stay independent of each other and of the per-email login limit. */
async function makeUser(opts: { status?: "active" | "suspended"; deleted?: boolean } = {}) {
  const id = `usr_test_${++userSeq}`;
  const email = `${id}@example.com`;
  await t.db.insert(users).values({ id, email, role: "nurse", passwordHash, status: opts.status ?? "active", deletedAt: opts.deleted ? new Date() : null });
  await t.db.insert(userProfiles).values({ userId: id, fullName: `Test User ${userSeq}` });
  return { id, email };
}

const login = (body: unknown, ip = newIp()) =>
  app.inject({ method: "POST", url: "/api/auth/login", payload: body as object, remoteAddress: ip });
const refresh = (token: string | undefined, opts: { ip?: string; origin?: string } = {}) =>
  app.inject({
    method: "POST", url: "/api/auth/refresh", remoteAddress: opts.ip ?? newIp(),
    ...(token ? { cookies: { [REFRESH_COOKIE]: token } } : {}),
    ...(opts.origin ? { headers: { origin: opts.origin } } : {}),
  });
const logout = (token: string | undefined, ip = newIp()) =>
  app.inject({ method: "POST", url: "/api/auth/logout", remoteAddress: ip, ...(token ? { cookies: { [REFRESH_COOKIE]: token } } : {}) });

const cookieOf = (res: { cookies: Array<{ name: string; value: string }> }) => res.cookies.find((c) => c.name === REFRESH_COOKIE);
async function session(email: string) {
  const res = await login({ email, password: PASSWORD });
  expect(res.statusCode).toBe(200);
  return { body: LoginResponse.parse(res.json()), refresh: cookieOf(res)!.value };
}
const familyRows = async (raw: string) => {
  const [row] = await t.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(raw)));
  return t.db.select().from(refreshTokens).where(eq(refreshTokens.familyId, row!.familyId));
};
const auditFor = (action: string) => t.db.select().from(auditLog).where(eq(auditLog.action, action));
const expect401Login = (res: { statusCode: number; json: () => unknown; cookies: unknown[] }) => {
  expect(res.statusCode).toBe(401);
  expect(res.json()).toEqual({ error: ErrorMessage.invalidCredentials });
  expect(res.cookies).toHaveLength(0);
};

describe("POST /api/auth/login", () => {
  it("200: exact body, 15-min HS256 JWT with sub/role/jti, hashed refresh row, audit row", async () => {
    const res = await login({ email: "maria.lopez@example.com", password: PASSWORD });
    expect(res.statusCode).toBe(200);
    const body = LoginResponse.parse(res.json()); // strict: no extra keys
    expect(body.user).toEqual({ id: "nurse-1", name: "Maria Lopez", role: "nurse" });

    const claims = decodeJwt(body.token);
    expect(claims).toMatchObject({ sub: "nurse-1", role: "nurse" });
    expect(claims.jti).toEqual(expect.any(String));
    expect(claims.exp! - claims.iat!).toBe(15 * 60);
    expect(Object.keys(claims).sort()).toEqual(["exp", "iat", "jti", "role", "sub"]);

    const raw = cookieOf(res)!.value;
    expect(Buffer.from(raw, "base64url")).toHaveLength(32); // 256-bit
    const rows = await familyRows(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(sha256(raw));
    expect(JSON.stringify(rows)).not.toContain(raw);
    expect((await auditFor("auth.login")).some((a) => a.actorUserId === "nurse-1")).toBe(true);
  });

  it("sets the refresh cookie httpOnly, SameSite=Strict, Path=/api/auth, 7 days (Secure off outside prod)", async () => {
    const c = cookieOf(await login({ email: "alex.kim@example.com", password: PASSWORD }))!;
    expect(c).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/api/auth", maxAge: 7 * 24 * 3600 });
    expect((c as { secure?: boolean }).secure).toBeFalsy();
  });

  it.each([["COOKIE_SECURE", "true"], ["NODE_ENV", "production"]])("sets Secure when %s=%s", async (name, value) => {
    const before = process.env[name];
    process.env[name] = value;
    try {
      const c = cookieOf(await login({ email: (await makeUser()).email, password: PASSWORD }))!;
      expect((c as { secure?: boolean }).secure).toBe(true);
    } finally {
      if (before === undefined) delete process.env[name];
      else process.env[name] = before;
    }
  });

  it("normalizes email (trim + case)", async () => {
    expect((await login({ email: "  Admin@MetroCare.example ", password: PASSWORD })).statusCode).toBe(200);
  });

  it("401 exact text: unknown email, wrong password, malformed body; failed attempts audited without the raw email", async () => {
    expect401Login(await login({ email: "nobody@example.com", password: PASSWORD }));
    expect401Login(await login({ email: "james.cook@example.com", password: "wrong" }));
    expect401Login(await login({ email: "not-an-email", password: PASSWORD }));
    expect401Login(await login({}));
    const failed = await auditFor("auth.login_failed");
    expect(failed.some((a) => (a.changes as { emailSha256?: string }).emailSha256 === sha256("nobody@example.com"))).toBe(true);
    expect(JSON.stringify(failed)).not.toContain("nobody@example.com");
  });

  it("401 for suspended and soft-deleted users with the correct password", async () => {
    expect401Login(await login({ email: (await makeUser({ status: "suspended" })).email, password: PASSWORD }));
    expect401Login(await login({ email: (await makeUser({ deleted: true })).email, password: PASSWORD }));
  });
});

describe("access token verification", () => {
  const key = new TextEncoder().encode(process.env.JWT_SECRET);
  it("accepts a fresh token", async () => {
    const { body } = await session((await makeUser()).email);
    await expect(verifyAccessToken(body.token)).resolves.toMatchObject({ role: "nurse" });
  });
  it("rejects malformed, tampered, re-signed, alg=none and expired tokens", async () => {
    const { body } = await session((await makeUser()).email);
    const [h, p, s] = body.token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...decodeJwt(body.token), role: "admin" })).toString("base64url");
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${p}.`;
    const expired = await new SignJWT({ role: "nurse" }).setProtectedHeader({ alg: "HS256" }).setSubject("nurse-1").setJti("j")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600).setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(key);
    const otherKey = await new SignJWT({ role: "nurse" }).setProtectedHeader({ alg: "HS256" }).setSubject("nurse-1").setJti("j")
      .setExpirationTime("15m").sign(new TextEncoder().encode("x".repeat(40)));
    for (const bad of ["not-a-jwt", `${h}.${forged}.${s}`, none, expired, otherKey]) {
      await expect(verifyAccessToken(bad)).rejects.toThrow();
    }
  });
});

describe("POST /api/auth/refresh", () => {
  it("rotates: new access + refresh token, old row revoked with replaced_by, same family, sliding 7-day expiry", async () => {
    const s = await session((await makeUser()).email);
    const res = await refresh(s.refresh);
    expect(res.statusCode).toBe(200);
    const body = LoginResponse.parse(res.json());
    expect(body.user).toEqual(s.body.user);
    const next = cookieOf(res)!;
    expect(next.value).not.toBe(s.refresh);
    expect(next).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/api/auth" });

    const rows = await familyRows(s.refresh);
    const old = rows.find((r) => r.tokenHash === sha256(s.refresh))!;
    const cur = rows.find((r) => r.tokenHash === sha256(next.value))!;
    expect(old.revokedAt).not.toBeNull();
    expect(old.replacedBy).toBe(cur.id);
    expect(cur.revokedAt).toBeNull();
    expect(cur.expiresAt.getTime() - Date.now()).toBeGreaterThan(7 * 24 * 3600 * 1000 - 60_000);

    expect((await refresh(next.value)).statusCode).toBe(200); // chain keeps going
  });

  it("401 and clears the cookie when the cookie is missing or unknown", async () => {
    for (const res of [await refresh(undefined), await refresh("garbage")]) {
      expect(res.statusCode).toBe(401);
      expect(ErrorBody.parse(res.json()).error).toBe(ErrorMessage.unauthorized);
      expect(cookieOf(res)?.value).toBe("");
    }
  });

  it("reuse of a rotated token (after the grace window) revokes the whole family and is audited", async () => {
    const s = await session((await makeUser()).email);
    const next = cookieOf(await refresh(s.refresh))!.value;
    await t.db.update(refreshTokens).set({ revokedAt: new Date(Date.now() - 60_000) }).where(eq(refreshTokens.tokenHash, sha256(s.refresh)));

    const reuse = await refresh(s.refresh); // attacker (or victim) replays the old token
    expect(reuse.statusCode).toBe(401);
    expect((await familyRows(s.refresh)).every((r) => r.revokedAt !== null)).toBe(true);
    expect((await refresh(next)).statusCode).toBe(401); // the legit successor is dead too
    const [row] = await t.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(s.refresh)));
    expect((await refresh(s.refresh)).statusCode).toBe(401); // replay again: still 401, no second audit row
    expect((await auditFor("auth.refresh_reuse_detected")).filter((a) => a.entityId === row!.familyId)).toHaveLength(1);
  });

  it("a rotated token inside the grace window gets 401 (not 409) once the family is logged out", async () => {
    const s = await session((await makeUser()).email);
    const next = cookieOf(await refresh(s.refresh))!.value;
    expect((await logout(next)).statusCode).toBe(204);
    expect((await refresh(s.refresh)).statusCode).toBe(401);
  });

  it("logout racing a refresh leaves no live token in the family", async () => {
    for (let i = 0; i < 5; i++) {
      const s = await session((await makeUser()).email);
      await Promise.all([refresh(s.refresh), logout(s.refresh)]);
      expect((await familyRows(s.refresh)).filter((r) => r.revokedAt === null)).toEqual([]);
    }
  });

  it("concurrent refreshes of one token: exactly one rotation wins, the rest get 409, the family survives", async () => {
    const s = await session((await makeUser()).email);
    const results = await Promise.all(Array.from({ length: 5 }, () => refresh(s.refresh)));
    const ok = results.filter((r) => r.statusCode === 200);
    expect(ok).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(4);
    expect(results.filter((r) => r.statusCode === 409).every((r) => cookieOf(r) === undefined)).toBe(true); // winner's cookie kept
    expect(await familyRows(s.refresh)).toHaveLength(2); // one new token, not five
    expect((await refresh(cookieOf(ok[0]!)!.value)).statusCode).toBe(200);
  });

  it("401 for an expired refresh token", async () => {
    const s = await session((await makeUser()).email);
    await t.db.update(refreshTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(refreshTokens.tokenHash, sha256(s.refresh)));
    expect((await refresh(s.refresh)).statusCode).toBe(401);
  });

  it("401 and family revoked when the user was suspended after login", async () => {
    const u = await makeUser();
    const s = await session(u.email);
    await t.db.update(users).set({ status: "suspended" }).where(eq(users.id, u.id));
    expect((await refresh(s.refresh)).statusCode).toBe(401);
    expect((await familyRows(s.refresh)).every((r) => r.revokedAt !== null)).toBe(true);
  });

  it("403 for a foreign Origin, 200 for the app origin", async () => {
    const s = await session((await makeUser()).email);
    expect((await refresh(s.refresh, { origin: "https://evil.example" })).statusCode).toBe(403);
    expect((await refresh(s.refresh, { origin: "http://localhost:3000" })).statusCode).toBe(200);
  });
});

describe("POST /api/auth/logout", () => {
  it("204, clears the cookie, revokes the family, audits once; repeated calls are safe", async () => {
    const u = await makeUser();
    const s = await session(u.email);
    const next = cookieOf(await refresh(s.refresh))!.value;

    const res = await logout(next);
    expect(res.statusCode).toBe(204);
    expect(cookieOf(res)).toMatchObject({ value: "", path: "/api/auth" });
    expect((await familyRows(next)).every((r) => r.revokedAt !== null)).toBe(true);
    expect((await refresh(next)).statusCode).toBe(401);

    expect((await logout(next)).statusCode).toBe(204);
    expect((await logout(undefined)).statusCode).toBe(204);
    expect((await auditFor("auth.logout")).filter((a) => a.actorUserId === u.id)).toHaveLength(1);
  });

  it("403 for a foreign Origin", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/logout", remoteAddress: newIp(), headers: { origin: "https://evil.example" } });
    expect(res.statusCode).toBe(403);
  });
});

describe("login rate limit (10 failures/min per IP and per email)", () => {
  it("successful logins don't count (shared NAT)", async () => {
    const ip = newIp();
    const { email } = await makeUser();
    for (let i = 0; i < 12; i++) expect((await login({ email, password: PASSWORD }, ip)).statusCode).toBe(200);
  });

  it("an oversized email is rejected with the 401 text and does not reach the limiter key", async () => {
    expect401Login(await login({ email: `${"a".repeat(100_000)}@example.com`, password: "x" }));
  });

  it("429 on the 11th attempt from one IP, across different emails", async () => {
    const ip = newIp();
    for (let i = 0; i < 10; i++) expect((await login({ email: `x${i}@example.com`, password: "wrong" }, ip)).statusCode).toBe(401);
    const res = await login({ email: "x10@example.com", password: "wrong" }, ip);
    expect(res.statusCode).toBe(429);
    expect(ErrorBody.parse(res.json()).error).toMatch(/too many/i);
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("429 on the 11th attempt for one email, across different IPs (normalized email)", async () => {
    const { email } = await makeUser();
    for (let i = 0; i < 10; i++) expect((await login({ email, password: "wrong" })).statusCode).toBe(401);
    expect((await login({ email: email.toUpperCase(), password: PASSWORD })).statusCode).toBe(429);
  });
});
