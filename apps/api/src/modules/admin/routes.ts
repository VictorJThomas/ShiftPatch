import {
  AdminAgencyResponse, AdminCoverageQuery, AdminCoverageResponse, AdminNurseResponse, AdminUsersQuery, AdminUsersResponse, ErrorMessage, ShiftIdParams,
} from "@shiftpatch/contracts";
import type { FastifyInstance } from "fastify";
import type { Db } from "../../db/client.js";
import { sendDenial } from "../authz/plugin.js";
import * as service from "./service.js";

/** Network-admin read routes (additive). Authorization first, then validation; unknown or foreign ids are the same 404. */
export function adminRoutes(app: FastifyInstance, db: () => Db) {
  const pre = { onRequest: [app.authenticate, app.loadActor] };

  app.get("/api/admin/coverage", pre, async (req, reply) => {
    const auth = service.authorizeAdmin(req.actor!);
    if (!auth.ok) return (sendDenial(reply, auth.denied), reply);
    const query = AdminCoverageQuery.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "Invalid query" });
    return AdminCoverageResponse.parse(await service.coverage(db(), auth.scopes, query.data));
  });

  app.get("/api/admin/users", pre, async (req, reply) => {
    const auth = service.authorizeAdmin(req.actor!);
    if (!auth.ok) return (sendDenial(reply, auth.denied), reply);
    const query = AdminUsersQuery.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "Invalid query" });
    const r = await service.listUsers(db(), auth.scopes, query.data);
    return r.ok ? AdminUsersResponse.parse(r.value) : reply.code(400).send({ error: r.invalid });
  });

  app.get("/api/admin/nurses/:id", pre, async (req, reply) => {
    const auth = service.authorizeAdmin(req.actor!);
    if (!auth.ok) return (sendDenial(reply, auth.denied), reply);
    const params = ShiftIdParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: ErrorMessage.notFound });
    const r = await service.nurse(db(), req.actor!, params.data.id);
    return r.ok ? AdminNurseResponse.parse(r.value) : reply.code(r.fail.status).send({ error: r.fail.error });
  });

  app.get("/api/admin/agencies/:id", pre, async (req, reply) => {
    const auth = service.authorizeAdmin(req.actor!);
    if (!auth.ok) return (sendDenial(reply, auth.denied), reply);
    const params = ShiftIdParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: ErrorMessage.notFound });
    const r = await service.agency(db(), auth.scopes, params.data.id);
    return r.ok ? AdminAgencyResponse.parse(r.value) : reply.code(r.fail.status).send({ error: r.fail.error });
  });
}
