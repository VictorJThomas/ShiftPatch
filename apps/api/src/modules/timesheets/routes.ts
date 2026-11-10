import { ListTimesheetsQuery, TimesheetErrorMessage, TimesheetIdParams, TimesheetResponse, TimesheetsResponse } from "@shiftpatch/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "../../db/client.js";
import type { RequestMeta } from "../audit/audit.js";
import { sendDenial } from "../authz/plugin.js";
import type { Result } from "../shifts/service.js";
import * as service from "./service.js";

const fail = (reply: FastifyReply, r: Extract<Result<never>, { ok: false }>) =>
  "denied" in r ? (sendDenial(reply, r.denied), reply) : "fail" in r ? reply.code(r.fail.status).send({ error: r.fail.error }) : reply.code(400).send({ error: r.invalid });
const meta = (req: FastifyRequest): RequestMeta => ({ requestId: req.id, ip: req.ip, userAgent: req.headers["user-agent"] ?? null });

export function timesheetRoutes(app: FastifyInstance, db: () => Db) {
  const pre = { onRequest: [app.authenticate, app.loadActor] }; // 401 before any parsing; every /api route must carry both

  // The nurse holding a started shift submits her hours (or resubmits after a dispute).
  app.post("/api/shifts/:id/timesheet", pre, async (req, reply) => {
    const params = TimesheetIdParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: TimesheetErrorMessage.shiftNotFound });
    const r = await service.submit(db(), req.actor!, params.data.id, req.body, meta(req));
    if (!r.ok) return fail(reply, r);
    return reply.code(201).send(TimesheetResponse.parse(r.value));
  });

  app.get("/api/nurses/me/timesheets", pre, async (req, reply) => {
    const r = await service.listMine(db(), req.actor!);
    if (!r.ok) return fail(reply, r);
    return TimesheetsResponse.parse({ timesheets: r.value });
  });

  // Agency members (active agency) or network admins; `?status=` filters.
  app.get("/api/timesheets", pre, async (req, reply) => {
    const query = ListTimesheetsQuery.safeParse(req.query);
    const r = await service.list(db(), req.actor!, query.success ? query.data.status : undefined); // authorization before query validation
    if (!r.ok) return fail(reply, r);
    if (!query.success) return reply.code(400).send({ error: "Invalid query" });
    return TimesheetsResponse.parse({ timesheets: r.value });
  });

  app.post("/api/timesheets/:id/approve", pre, async (req, reply) => {
    const params = TimesheetIdParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: TimesheetErrorMessage.timesheetNotFound });
    const r = await service.approve(db(), req.actor!, params.data.id, meta(req));
    if (!r.ok) return fail(reply, r);
    return TimesheetResponse.parse(r.value);
  });

  app.post("/api/timesheets/:id/dispute", pre, async (req, reply) => {
    const params = TimesheetIdParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: TimesheetErrorMessage.timesheetNotFound });
    const r = await service.dispute(db(), req.actor!, params.data.id, req.body, meta(req));
    if (!r.ok) return fail(reply, r);
    return TimesheetResponse.parse(r.value);
  });
}
