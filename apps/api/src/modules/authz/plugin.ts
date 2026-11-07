import { ErrorMessage } from "@shiftpatch/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "../../db/client.js";
import { JwtConfigError, verifyAccessToken } from "../auth/tokens.js";
import { type Actor, AgencyHeaderError, type AuthContext, findActiveUser, loadActorFor } from "./actor.js";
import { denialResponse, type Decision } from "./decision.js";

declare module "fastify" {
  interface FastifyContextConfig {
    /** Route opt-out: X-Agency-Id is not read (not validated, no 403). Only for bootstrap calls such as GET /api/me. */
    ignoreAgencyHeader?: boolean;
  }
  interface FastifyRequest {
    auth: AuthContext | null; // set by authenticate
    actor: Actor | null; // set by loadActor
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    loadActor: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const BEARER = /^Bearer (\S+)$/;

/** Same effect as fastify-plugin: decorators land on the parent instance instead of an encapsulated child. */
const shared = <T extends (...args: never[]) => unknown>(fn: T) => Object.assign(fn, { [Symbol.for("skip-override")]: true });

/**
 * Pipeline (ARCHITECTURE §6.3): requestId -> authenticate -> loadActor -> schema validation -> handler.
 * Both hooks run in `onRequest`, so a missing/bad token gets 401 before body parsing or Zod can answer 400.
 * Opt in per route: `{ onRequest: [app.authenticate, app.loadActor] }`.
 */
export const requestIdPlugin = shared(async (app: FastifyInstance) => {
  // Fastify generates req.id (never taken from the client); echo it so a response can be matched to a log/audit row.
  app.addHook("onRequest", async (req, reply) => void reply.header("x-request-id", req.id));
});

export const authenticatePlugin = shared(async (app: FastifyInstance, opts: { db: () => Db }) => {
  app.decorateRequest("auth", null); // null, not an object: a shared object default would leak between requests
  app.decorate("authenticate", async (req: FastifyRequest, reply: FastifyReply) => {
    req.auth = null;
    const token = BEARER.exec(req.headers.authorization ?? "")?.[1];
    const fail = () => reply.code(401).send({ error: ErrorMessage.unauthorized });
    if (!token) return fail();
    let claims;
    try {
      claims = await verifyAccessToken(token); // signature, HS256 only, expiry, claim shape
    } catch (err) {
      if (err instanceof JwtConfigError) throw err; // misconfig is a 500, not a 401
      return fail();
    }
    const auth = await findActiveUser(opts.db(), claims.sub, claims.role);
    if (!auth) return fail();
    req.auth = auth;
  });
});

export const loadActorPlugin = shared(async (app: FastifyInstance, opts: { db: () => Db }) => {
  app.decorateRequest("actor", null);
  app.decorate("loadActor", async (req: FastifyRequest, reply: FastifyReply) => {
    req.actor = null;
    if (!req.auth) return reply.code(401).send({ error: ErrorMessage.unauthorized }); // authenticate must run first
    try {
      req.actor = await loadActorFor(opts.db(), req.auth, req.routeOptions.config.ignoreAgencyHeader ? undefined : req.headers["x-agency-id"]);
    } catch (err) {
      if (err instanceof AgencyHeaderError) return reply.code(403).send({ error: ErrorMessage.agencyNotAllowed });
      throw err;
    }
  });
});

/** Sends the mapped error and returns true when `decision` denies; use as `if (sendDenial(reply, can(...))) return reply;`. */
export function sendDenial(reply: FastifyReply, decision: Decision): boolean {
  if (decision.allow) return false;
  const { status, body } = denialResponse(decision.reason);
  void reply.code(status).send(body);
  return true;
}
