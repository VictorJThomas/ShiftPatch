import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { createDb } from "./db/client.js";
import { authRoutes } from "./modules/auth/routes.js";
import { authenticatePlugin, loadActorPlugin, requestIdPlugin } from "./modules/authz/plugin.js";

export function buildApp() {
  // TRUST_PROXY = number of proxy hops in front of the API (Vercel rewrite + Railway edge), so req.ip is the client.
  // ponytail: hop count trusts X-Forwarded-For, which a client calling the Railway domain directly can spoof, so per-IP
  // limits are advisory there. Upgrade: Vercel rewrite adds a secret header, trust XFF only with it (or block direct access).
  // The per-email login limit keys on the email hash, not the IP.
  const hops = Number(process.env.TRUST_PROXY ?? 0);
  const app = Fastify({ trustProxy: (_addr: string, hop: number) => hop < hops });

  // Lazy: the DB client is created on first use, from DATABASE_URL (route probes and /api/health never connect).
  let conn: ReturnType<typeof createDb> | undefined;
  const db = () => (conn ??= createDb(process.env.DATABASE_URL ?? "")).db;
  app.addHook("onClose", async () => conn?.sql.end());

  app.register(cookie);
  app.register(rateLimit, { global: false, cache: 50_000 }); // LRU keys are short (IPs, email hashes): ~100 B each
  app.register(requestIdPlugin);
  app.register(authenticatePlugin, { db });
  app.register(loadActorPlugin, { db });
  app.register(async (scope) => authRoutes(scope, db)); // after the plugins above, so their decorators exist

  app.get("/api/health", () => ({ status: "ok" }));

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: "Not found" }));
  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    const status = err.statusCode ?? 500;
    reply.code(status).send({ error: status >= 500 ? "Internal server error" : err.message });
  });

  return app;
}
