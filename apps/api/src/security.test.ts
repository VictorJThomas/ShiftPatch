// Security configuration (ARCHITECTURE §13): response headers on every kind of response, and no secret in the logs.
// Logs are captured from the real pino logger the server uses (buildApp's redaction config), at trace level.
import { ErrorMessage, LoginResponse } from "@shiftpatch/contracts";
import { sql } from "drizzle-orm";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { seed } from "./db/seed.js";
import { createTestDb } from "./db/test-db.js";
import { REFRESH_COOKIE } from "./modules/auth/tokens.js";

const PASSWORD = "Trial2026!";
const WRONG_PASSWORD = "Wrong-Secret-123"; // gitleaks:allow (fake fixture: a failed login must not log the attempted password)
const lines: string[] = [];
let t: Awaited<ReturnType<typeof createTestDb>>;
let app: FastifyInstance;

beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db);
  process.env.DATABASE_URL = t.url;
  app = buildApp({ logger: { level: "trace", stream: { write: (msg: string) => void lines.push(msg) } } });
  // A query that fails with a bound parameter: drizzle wraps it in DrizzleQueryError with the params in message + stack.
  app.get("/__test/db-fail", async () => t.db.execute(sql`select ${"leak-me@example.com"}::int`));
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await t?.drop();
});

let ip = 0;
const inject = (opts: InjectOptions) => app.inject({ remoteAddress: `10.77.0.${++ip}`, ...opts });

describe("security headers (@fastify/helmet)", () => {
  it.each([
    ["200 health", "GET", "/api/health", undefined],
    ["401 protected", "GET", "/api/shifts", undefined],
    ["404 unknown", "GET", "/api/nope", undefined],
    ["401 login", "POST", "/api/auth/login", { email: "x@example.com", password: "nope" }],
  ] as const)("%s carries CSP, HSTS, XFO, Referrer-Policy, nosniff", async (_name, method, url, payload) => {
    const res = await inject({ method, url, ...(payload ? { payload } : {}) });
    expect(res.headers["content-security-policy"]).toBe("default-src 'none';frame-ancestors 'none';base-uri 'none';form-action 'none'");
    expect(res.headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("logs never contain secrets", () => {
  it("login, refresh, authenticated calls, failed login and explicit object logs leak no password, JWT or cookie", async () => {
    const login = await inject({ method: "POST", url: "/api/auth/login", payload: { email: "maria.lopez@example.com", password: PASSWORD } });
    expect(login.statusCode).toBe(200);
    const { token } = LoginResponse.parse(login.json());
    const refreshValue = login.cookies.find((c) => c.name === REFRESH_COOKIE)!.value;

    const refresh = await inject({ method: "POST", url: "/api/auth/refresh", cookies: { [REFRESH_COOKIE]: refreshValue } });
    expect(refresh.statusCode).toBe(200);
    const rotated = refresh.cookies.find((c) => c.name === REFRESH_COOKIE)!.value;
    const token2 = LoginResponse.parse(refresh.json()).token;

    expect((await inject({ method: "GET", url: "/api/shifts", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);
    expect((await inject({ method: "POST", url: "/api/auth/login", payload: { email: "maria.lopez@example.com", password: WRONG_PASSWORD } })).json())
      .toEqual({ error: ErrorMessage.invalidCredentials });

    // Anything that logs a request-like object (a future serializer, a debug line) is redacted too.
    app.log.info({ req: { headers: { authorization: `Bearer ${token}`, cookie: `${REFRESH_COOKIE}=${rotated}` } } }, "debug request");
    app.log.info({ password: PASSWORD, token: token2, user: { password: PASSWORD, refreshToken: rotated } }, "debug body");
    app.log.info({ url: "https://bucket.example/creds/abc?X-Amz-Signature=deadbeef" }, "signed link");

    const out = lines.join("");
    expect(out).toContain("debug body"); // capture is live
    for (const secret of [PASSWORD, WRONG_PASSWORD, token, token2, refreshValue, rotated, "X-Amz-Signature"]) expect(out).not.toContain(secret);
    expect(out).not.toMatch(/eyJ[\w-]+\.[\w-]+\.[\w-]+/); // no JWT at all
    expect(out).toContain("[redacted]");
  });

  it("nested secrets (two levels deep) are redacted", async () => {
    app.log.info({ body: { user: { password: "Nested-Secret-1", token: "nested-token-2" } } }, "nested");
    const out = lines.join("");
    expect(out).toContain("nested");
    expect(out).not.toContain("Nested-Secret-1");
    expect(out).not.toContain("nested-token-2");
  });

  it("a 5xx from a failed SQL query logs the query but not its bound parameters", async () => {
    const res = await inject({ method: "GET", url: "/__test/db-fail" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "Internal server error" });
    const out = lines.join("");
    expect(out).toContain("Failed query: select $1::int"); // the cause is still diagnosable
    expect(out).toContain("params: [redacted]");
    expect(out).toContain('"code":"22P02"'); // SQLSTATE kept
    expect(out).not.toContain("leak-me@example.com");
  });
});
