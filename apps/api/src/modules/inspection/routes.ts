import {
  CreateInspectionPackageRequest, InspectionDocumentLinkResponse, InspectionDocumentParams, InspectionMessage, InspectionNursesQuery, InspectionNursesResponse,
  InspectionPackageDetailResponse, InspectionPackageResponse, InspectionPackagesResponse, ShiftIdParams,
} from "@shiftpatch/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "../../db/client.js";
import { type ObjectStorage, privateStorageFromEnv } from "../../lib/storage.js";
import type { RequestMeta } from "../audit/audit.js";
import { can } from "../authz/can.js";
import { sendDenial } from "../authz/plugin.js";
import * as service from "./service.js";

const meta = (req: FastifyRequest): RequestMeta => ({ requestId: req.id, ip: req.ip, userAgent: req.headers["user-agent"] ?? null });
const TOO_MANY = "Too many requests, try again later";

/** Scoped inspection package routes (ESCALATION.md Option D). Authorization first (admin / agency owner), then validation. `storage` is injected by tests. */
export function inspectionRoutes(app: FastifyInstance, db: () => Db, storage?: ObjectStorage) {
  let envStorage: ObjectStorage | null | undefined;
  const store = () => storage ?? (envStorage ??= privateStorageFromEnv());
  // createRateLimit, not app.rateLimit (see auth routes). In-memory per instance.
  const generateLimit = app.createRateLimit({ max: 10, timeWindow: 60_000, keyGenerator: (req) => `inspection-generate:${req.actor?.userId}` });
  const linkLimit = app.createRateLimit({ max: 60, timeWindow: 60_000, keyGenerator: (req) => `inspection-link:${req.actor?.userId}` });

  const pre = { onRequest: [app.authenticate, app.loadActor] };
  const gate = (req: FastifyRequest, reply: FastifyReply) => sendDenial(reply, can(req.actor!, "inspection:use", {}));
  const throttled = async (limit: typeof generateLimit, req: FastifyRequest, reply: FastifyReply) => {
    const r = await limit(req);
    if (!r.isAllowed && r.isExceeded) { void reply.header("retry-after", String(r.ttlInSeconds)).code(429).send({ error: TOO_MANY }); return true; }
    return false;
  };
  const fail = (reply: FastifyReply, r: { fail: { status: number; error: string } } | { denied: Parameters<typeof sendDenial>[1] }) =>
    "denied" in r ? (sendDenial(reply, r.denied), reply) : reply.code(r.fail.status).send({ error: r.fail.error });

  app.get("/api/inspection/nurses", pre, async (req, reply) => {
    if (gate(req, reply)) return reply;
    const q = InspectionNursesQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.issues[0]?.message === InspectionMessage.invalidPeriod ? InspectionMessage.invalidPeriod : "Invalid query" });
    return reply.header("cache-control", "no-store").send(InspectionNursesResponse.parse({ nurses: await service.candidates(db(), req.actor!, q.data) }));
  });

  app.post("/api/inspection-packages", pre, async (req, reply) => {
    if (gate(req, reply)) return reply;
    if (await throttled(generateLimit, req, reply)) return reply;
    const body = CreateInspectionPackageRequest.safeParse(req.body ?? {});
    if (!body.success) {
      const msg = body.error.issues.find((i) => i.code === "custom")?.message;
      return reply.code(400).send({ error: msg ?? InspectionMessage.invalidRequest });
    }
    const r = await service.generate(db(), req.actor!, body.data, meta(req));
    if (!r.ok) return fail(reply, r);
    return reply.code(201).header("cache-control", "no-store").send(InspectionPackageResponse.parse({ package: r.value }));
  });

  app.get("/api/inspection-packages", pre, async (req, reply) => {
    if (gate(req, reply)) return reply;
    return reply.header("cache-control", "no-store").send(InspectionPackagesResponse.parse({ packages: await service.list(db(), req.actor!) }));
  });

  app.get("/api/inspection-packages/:id", pre, async (req, reply) => {
    if (gate(req, reply)) return reply;
    const params = ShiftIdParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: InspectionMessage.notFound });
    const r = await service.view(db(), req.actor!, params.data.id, meta(req));
    return r.ok ? reply.header("cache-control", "no-store").send(InspectionPackageDetailResponse.parse(r.value)) : fail(reply, r);
  });

  app.post("/api/inspection-packages/:id/documents/:credentialId/link", pre, async (req, reply) => {
    if (gate(req, reply)) return reply;
    if (await throttled(linkLimit, req, reply)) return reply;
    const params = InspectionDocumentParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: InspectionMessage.notFound });
    const s = store();
    if (!s) {
      req.log.error("inspection document link: object storage is not configured (S3_ENDPOINT / R2_* env)");
      return reply.code(503).send({ error: "File storage is unavailable. Try again later" });
    }
    const r = await service.documentLink(db(), s, req.actor!, params.data.id, params.data.credentialId, meta(req));
    return r.ok ? reply.header("cache-control", "no-store").send(InspectionDocumentLinkResponse.parse(r.value)) : fail(reply, r);
  });

  app.post("/api/inspection-packages/:id/revoke", pre, async (req, reply) => {
    if (gate(req, reply)) return reply;
    const params = ShiftIdParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: InspectionMessage.notFound });
    const r = await service.revoke(db(), req.actor!, params.data.id, meta(req));
    return r.ok ? InspectionPackageResponse.parse({ package: r.value }) : fail(reply, r);
  });
}
