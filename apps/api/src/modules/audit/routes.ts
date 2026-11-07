import { AuditLogQuery, AuditLogResponse } from "@shiftpatch/contracts";
import type { FastifyInstance } from "fastify";
import type { Db } from "../../db/client.js";
import { sendDenial } from "../authz/plugin.js";
import { authorizeAuditRead, listAuditLogs } from "./service.js";

export function auditRoutes(app: FastifyInstance, db: () => Db) {
  const pre = { onRequest: [app.authenticate, app.loadActor] }; // 401 before any parsing

  // Admin: their network(s). Agency: rows with the validated active agency_id. Nurse / viewer: 403. Read-only: no write route exists.
  app.get("/api/audit-logs", pre, async (req, reply) => {
    const auth = authorizeAuditRead(req.actor!); // authorization first: a caller without access never learns whether their query was valid
    if (!auth.ok) return (sendDenial(reply, auth.denied), reply);
    const query = AuditLogQuery.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "Invalid query" });
    const r = await listAuditLogs(db(), auth.scope, query.data);
    return r.ok ? AuditLogResponse.parse(r.value) : reply.code(400).send({ error: r.invalid });
  });
}
