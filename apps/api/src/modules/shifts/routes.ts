import {
  AgencyIdParams, AgencyShiftsResponse, CancelShiftResponse, ClaimShiftResponse, CreateShiftResponse, ErrorMessage, ListShiftsQuery, ListShiftsResponse, ShiftIdParams,
} from "@shiftpatch/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "../../db/client.js";
import type { RequestMeta } from "../audit/audit.js";
import { sendDenial } from "../authz/plugin.js";
import { toShift } from "./mappers.js";
import * as service from "./service.js";

const badRequest = (reply: FastifyReply, error: string) => reply.code(400).send({ error });
/** Sends the mapped denial (403 / 400 select-agency / 404) or the validation message (400). */
const fail = (reply: FastifyReply, r: Extract<service.Result<never>, { ok: false }>) =>
  "denied" in r ? (sendDenial(reply, r.denied), reply) : "fail" in r ? reply.code(r.fail.status).send({ error: r.fail.error }) : badRequest(reply, r.invalid);
const meta = (req: FastifyRequest): RequestMeta => ({ requestId: req.id, ip: req.ip, userAgent: req.headers["user-agent"] ?? null });

export function shiftRoutes(app: FastifyInstance, db: () => Db) {
  const pre = { onRequest: [app.authenticate, app.loadActor] }; // 401 before any parsing; every /api route must carry both

  // 2. Full marketplace; `?matchable=true` = the nurse view (additive, same shape).
  app.get("/api/shifts", pre, async (req, reply) => {
    const query = ListShiftsQuery.safeParse(req.query);
    if (!query.success) return badRequest(reply, "Invalid query");
    const actor = req.actor!;
    if (query.data.matchable !== "true") return ListShiftsResponse.parse({ shifts: (await service.listMarketplace(db(), actor)).map(toShift) });
    const r = await service.listMatchable(db(), actor);
    if (!r.ok) return fail(reply, r);
    return ListShiftsResponse.parse({ shifts: r.value.map(toShift) });
  });

  // 6. One agency's shifts: members of it, or an admin of its network.
  app.get("/api/agencies/:agencyId/shifts", pre, async (req, reply) => {
    const params = AgencyIdParams.safeParse(req.params);
    if (!params.success) return reply.code(403).send({ error: ErrorMessage.forbidden }); // malformed id can't be a member's agency
    const r = await service.listForAgency(db(), req.actor!, params.data.agencyId);
    if (!r.ok) return fail(reply, r);
    return AgencyShiftsResponse.parse({ agencyId: params.data.agencyId, shifts: r.value.map(toShift) });
  });

  // 3. Agency owner/manager posts an open shift in the validated active agency.
  app.post("/api/shifts", pre, async (req, reply) => {
    const r = await service.createShift(db(), req.actor!, req.body);
    if (r.ok) return reply.code(201).send(CreateShiftResponse.parse(toShift(r.value)));
    return fail(reply, r);
  });

  // 4. A nurse claims an open shift: atomic, eligibility-checked (ARCHITECTURE §5.2). Body is ignored: the nurse is the token's user.
  app.post("/api/shifts/:id/claim", pre, async (req, reply) => {
    const params = ShiftIdParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: ErrorMessage.shiftNotFound });
    const r = await service.claimShift(db(), req.actor!, params.data.id, meta(req));
    if (!r.ok) return fail(reply, r);
    return ClaimShiftResponse.parse(toShift(r.value));
  });

  // 5. filled -> open (not the agency withdrawal): claiming nurse (advance only), owning agency, network admin (ARCHITECTURE §5.4).
  app.post("/api/shifts/:id/cancel", pre, async (req, reply) => {
    const params = ShiftIdParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: ErrorMessage.shiftNotFound });
    const r = await service.cancelShift(db(), req.actor!, params.data.id, req.body, meta(req));
    if (!r.ok) return fail(reply, r);
    return CancelShiftResponse.parse({ ...toShift(r.value.shift), cancellation: r.value.cancellation });
  });
}
