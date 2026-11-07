import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { DrizzleQueryError } from "drizzle-orm";
import Fastify, { type FastifyServerOptions } from "fastify";
import { createDb } from "./db/client.js";
import { auditRoutes } from "./modules/audit/routes.js";
import type { ObjectStorage } from "./lib/storage.js";
import { authRoutes } from "./modules/auth/routes.js";
import { credentialRoutes } from "./modules/credentials/routes.js";
import { meRoutes } from "./modules/me/routes.js";
import { shiftRoutes } from "./modules/shifts/routes.js";
import { authenticatePlugin, loadActorPlugin, requestIdPlugin } from "./modules/authz/plugin.js";

/**
 * Pino redaction (ARCHITECTURE §13 Logging). Fastify's default request serializer logs no headers or bodies, so this is
 * defense in depth for anything that logs a request, reply or error object with them (custom logs, future serializers).
 */
export const LOG_REDACT = [
  "req.headers.authorization", "req.headers.cookie",
  "res.headers[\"set-cookie\"]", "headers.authorization", "headers.cookie",
  "password", "token", "refreshToken", "accessToken", "objectKey", "url",
  "*.password", "*.token", "*.refreshToken", "*.accessToken", "*.objectKey", "*.passwordHash", "*.tokenHash", "*.params",
  "*.*.password", "*.*.token", "*.*.refreshToken", "*.*.accessToken", "*.*.objectKey", "*.*.passwordHash", "*.*.tokenHash",
];

/**
 * drizzle's DrizzleQueryError puts the bound SQL params (emails, IPs, token hashes) in its message and stack, and the
 * Postgres cause can echo values too (`invalid input syntax ... "<value>"`, unique-violation `detail`). Log the query,
 * the SQLSTATE and the constraint/table/column names: enough to diagnose, no data.
 */
function loggable(err: Error): Error {
  if (!(err instanceof DrizzleQueryError)) return err;
  const strip = (text?: string) => text?.replace(/\nparams: [^\n]*/, "\nparams: [redacted]");
  const pg = (err.cause ?? {}) as { code?: string; constraint_name?: string; table_name?: string; column_name?: string };
  const cause = { code: pg.code, constraint: pg.constraint_name, table: pg.table_name, column: pg.column_name };
  return Object.assign(new Error(strip(err.message)), { name: "DrizzleQueryError", stack: strip(err.stack?.split("\ncaused by:")[0]), pgError: cause });
}
// Top-level `url` (e.g. a signed document link logged as { url }) is redacted; the request line's `req.url` is not: it carries ids only.

type LoggerOption = boolean | Exclude<FastifyServerOptions["logger"], boolean | undefined>;

/** `storage`: tests inject an in-memory fake; unset = the private bucket from the S3_ENDPOINT / R2_* env, read on first upload. */
export function buildApp({ logger = false, storage }: { logger?: LoggerOption; storage?: ObjectStorage } = {}) {
  // TRUST_PROXY = number of proxy hops in front of the API (Vercel rewrite + Railway edge), so req.ip is the client.
  // ponytail: hop count trusts X-Forwarded-For, which a client calling the Railway domain directly can spoof, so per-IP
  // limits are advisory there. Upgrade: Vercel rewrite adds a secret header, trust XFF only with it (or block direct access).
  // The per-email login limit keys on the email hash, not the IP.
  const hops = Number(process.env.TRUST_PROXY ?? 0);
  const custom = logger === true || logger === false ? {} : logger;
  const extraPaths = custom.redact === undefined ? [] : Array.isArray(custom.redact) ? custom.redact : custom.redact.paths;
  const loggerOpts = logger === false ? false : { ...custom, redact: { paths: [...LOG_REDACT, ...extraPaths], censor: "[redacted]" } };
  const app = Fastify({ logger: loggerOpts, trustProxy: (_addr: string, hop: number) => hop < hops });

  // Lazy: the DB client is created on first use, from DATABASE_URL (route probes and /api/health never connect).
  let conn: ReturnType<typeof createDb> | undefined;
  const db = () => (conn ??= createDb(process.env.DATABASE_URL ?? "")).db;
  app.addHook("onClose", async () => conn?.sql.end());

  // Tolerate `Content-Type: application/json` with an empty body (Fastify's default is FST_ERR_CTP_EMPTY_JSON_BODY, 400): read as no body.
  // Everything else still goes through Fastify's default parser (prototype-poisoning guard, 400 on malformed JSON -> `{ error }`).
  const defaultJson = app.getDefaultJsonParser("error", "error");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    const text = body.toString();
    return text.trim() === "" ? done(null, undefined) : defaultJson(req, text, done);
  });

  // Security headers on every response (ARCHITECTURE §13). The API serves JSON only, so the CSP denies everything: nothing
  // here should ever be rendered or framed. HSTS 1 year; harmless over plain HTTP locally (browsers ignore it there).
  app.register(helmet, {
    contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] } },
    strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "no-referrer" },
    crossOriginResourcePolicy: { policy: "same-origin" },
  });
  app.register(cookie);
  app.register(rateLimit, { global: false, cache: 50_000 }); // LRU keys are short (IPs, email hashes): ~100 B each
  app.register(requestIdPlugin);
  app.register(authenticatePlugin, { db });
  app.register(loadActorPlugin, { db });
  app.register(async (scope) => authRoutes(scope, db)); // after the plugins above, so their decorators exist
  app.register(async (scope) => shiftRoutes(scope, db));
  app.register(async (scope) => meRoutes(scope, db));
  app.register(async (scope) => auditRoutes(scope, db));
  app.register(async (scope) => credentialRoutes(scope, db, storage));

  app.get("/api/health", () => ({ status: "ok" }));

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: "Not found" }));
  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) req.log.error(loggable(err)); // the client only gets a generic message; the real cause (with stack) goes to the server log
    reply.code(status).send({ error: status >= 500 ? "Internal server error" : err.message });
  });

  return app;
}
