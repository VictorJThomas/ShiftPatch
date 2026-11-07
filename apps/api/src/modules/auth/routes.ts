import { ErrorMessage, LoginRequest, LoginResponse } from "@shiftpatch/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "../../db/client.js";
import type { RequestMeta } from "../audit/audit.js";
import { login, logout, refresh, type SessionUser } from "./service.js";
import { assertJwtConfigured, REFRESH_COOKIE, REFRESH_TOKEN_TTL_MS, sha256, signAccessToken } from "./tokens.js";

const unauthorized = { error: ErrorMessage.unauthorized };
const invalidCredentials = { error: ErrorMessage.invalidCredentials };

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true",
  sameSite: "strict" as const,
  path: "/api/auth", // never sent to the rest of the API
});

const meta = (req: FastifyRequest): RequestMeta => ({ requestId: req.id, ip: req.ip, userAgent: req.headers["user-agent"] ?? null });

const normalizeEmail = (body: unknown) =>
  body && typeof body === "object" && "email" in body && typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined;

/**
 * Cookie-authenticated routes accept a missing Origin (non-browser clients cannot ride a victim's cookie)
 * but reject any other origin than the app's. Defense in depth on top of SameSite=Strict.
 */
const originAllowed = (req: FastifyRequest) =>
  req.headers.origin === undefined || req.headers.origin === (process.env.APP_ORIGIN ?? "http://localhost:3000");

export function authRoutes(app: FastifyInstance, db: () => Db) {
  // createRateLimit (not app.rateLimit): app.rateLimit hooks share a per-request "ran" flag, so a second one would be skipped.
  // ponytail: in-memory store, per instance. Move to the Redis store if the API runs more than one replica.
  const tooMany = (reply: FastifyReply, ttlInSeconds: number) =>
    reply.header("retry-after", String(ttlInSeconds)).code(429).send({ error: "Too many requests, try again later" });
  const limiter = (prefix: string, max: number, key: (req: FastifyRequest) => string) => {
    const check = app.createRateLimit({ max, timeWindow: 60_000, keyGenerator: (req) => `${prefix}:${key(req)}` });
    return {
      /** Every request counts. */
      hit: async (req: FastifyRequest, reply: FastifyReply) => {
        const r = await check(req);
        if (!r.isAllowed && r.isExceeded) return tooMany(reply, r.ttlInSeconds);
      },
      /** Blocks once `max` failures are recorded, without counting this request. */
      gate: async (req: FastifyRequest, reply: FastifyReply) => {
        const r = await check(req, { increment: false });
        if (!r.isAllowed && r.remaining === 0) return tooMany(reply, Math.max(1, r.ttlInSeconds));
      },
      fail: (req: FastifyRequest) => check(req),
    };
  };
  // Login counts failures only, so a shared hospital NAT is not throttled by successful logins.
  // Email key = SHA-256 of a valid email (bounded size), else the IP: junk bodies can't create or evict email counters.
  const emailKey = (req: FastifyRequest) => {
    const email = LoginRequest.shape.email.safeParse(normalizeEmail(req.body));
    return email.success ? sha256(email.data) : `ip:${req.ip}`;
  };
  const loginLimits = [limiter("login-ip", 10, (req) => req.ip), limiter("login-email", 10, emailKey)];
  const loginFailed = (req: FastifyRequest) => Promise.all(loginLimits.map((l) => l.fail(req)));
  const sessionLimit = limiter("session-ip", 30, (req) => req.ip).hit;

  const sendSession = async (reply: FastifyReply, user: SessionUser, refreshToken: string) => {
    reply.setCookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions(), maxAge: REFRESH_TOKEN_TTL_MS / 1000 });
    return LoginResponse.parse({ token: await signAccessToken(user), user }); // body stays exactly { token, user }
  };

  app.post("/api/auth/login", { preHandler: loginLimits.map((l) => l.gate) }, async (req, reply) => {
    assertJwtConfigured(); // fail before any DB write, never after
    // Malformed body -> the same 401 as wrong credentials (invalid JSON still gets Fastify's 400 before this runs).
    const parsed = LoginRequest.safeParse({ ...(req.body as object), email: normalizeEmail(req.body) });
    const result = parsed.success ? await login(db(), parsed.data.email, parsed.data.password, meta(req)) : null;
    if (!result) {
      await loginFailed(req);
      return reply.code(401).send(invalidCredentials);
    }
    return sendSession(reply, result.user, result.refreshToken);
  });

  app.post("/api/auth/refresh", { preHandler: sessionLimit }, async (req, reply) => {
    if (!originAllowed(req)) return reply.code(403).send({ error: ErrorMessage.forbidden });
    assertJwtConfigured(); // a rotation committed before a signing failure would strand the client
    const raw = req.cookies[REFRESH_COOKIE];
    const result = raw ? await refresh(db(), raw, meta(req)) : ({ kind: "invalid" } as const);
    // Lost a concurrent rotation: keep the cookie, the winning response already set the new one. Client retries.
    if (result.kind === "race") return reply.code(409).send({ error: "Session refresh already in progress, retry" });
    if (result.kind === "invalid") {
      reply.clearCookie(REFRESH_COOKIE, cookieOptions());
      return reply.code(401).send(unauthorized);
    }
    return sendSession(reply, result.user, result.refreshToken);
  });

  app.post("/api/auth/logout", { preHandler: sessionLimit }, async (req, reply) => {
    if (!originAllowed(req)) return reply.code(403).send({ error: ErrorMessage.forbidden });
    const raw = req.cookies[REFRESH_COOKIE];
    if (raw) await logout(db(), raw, meta(req));
    reply.clearCookie(REFRESH_COOKIE, cookieOptions());
    return reply.code(204).send();
  });
}
