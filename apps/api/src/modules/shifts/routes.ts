import {
  AgencyCoverageQuery, AgencyCoverageResponse, AgencyIdParams, AgencyShiftsResponse, CancelShiftResponse, ClaimShiftResponse, CreateShiftResponse, ErrorMessage, ListShiftsQuery, ListShiftsResponse, NurseShiftsResponse, ShiftIdParams, ShiftNurseResponse, WithdrawShiftResponse,
} from "@shiftpatch/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "../../db/client.js";
import type { RequestMeta } from "../audit/audit.js";
import { sendDenial } from "../authz/plugin.js";
import { toCoverageRow, toShift } from "./mappers.js";
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
    const { matchable, ...filters } = query.data; // status / role / date / agencyId: optional AND filters, none = the spec list
    if (matchable !== "true") return ListShiftsResponse.parse({ shifts: (await service.listMarketplace(db(), actor, filters)).map(toShift) });
    const r = await service.listMatchable(db(), actor, new Date(), filters);
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

  // Coverage: route 6's shifts plus the claiming nurse's name; same authorization as route 6. Filters AND together.
  app.get("/api/agencies/:agencyId/coverage", pre, async (req, reply) => {
    const params = AgencyIdParams.safeParse(req.params);
    if (!params.success) return reply.code(403).send({ error: ErrorMessage.forbidden });
    const auth = await service.authorizeAgencyCoverage(db(), req.actor!, params.data.agencyId); // authorization before query validation
    if (!auth.ok) return fail(reply, auth);
    const query = AgencyCoverageQuery.safeParse(req.query);
    if (!query.success) return badRequest(reply, "Invalid query");
    const rows = await service.coverageForAgency(db(), auth.value, query.data);
    return AgencyCoverageResponse.parse({ agencyId: params.data.agencyId, shifts: rows.map(toCoverageRow) });
  });

  // The nurse who claimed a shift (name, email, license type, credentials; never object keys). Owning agency owner/manager or network admin.
  app.get("/api/shifts/:id/nurse", pre, async (req, reply) => {
    const params = ShiftIdParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: ErrorMessage.shiftNotFound });
    const r = await service.nurseOfShift(db(), req.actor!, params.data.id);
    if (!r.ok) return fail(reply, r);
    return ShiftNurseResponse.parse(r.value);
  });

  // 3. Agency owner/manager posts an open shift in the validated active agency.
  app.post("/api/shifts", pre, async (req, reply) => {
    const r = await service.createShift(db(), req.actor!, req.body, meta(req));
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

  // Agency withdrawal: open -> cancelled (the other "cancel"). No body; no email (no nurse to tell).
  app.post("/api/shifts/:id/withdraw", pre, async (req, reply) => {
    const params = ShiftIdParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: ErrorMessage.shiftNotFound });
    const r = await service.withdrawShift(db(), req.actor!, params.data.id, meta(req));
    if (!r.ok) return fail(reply, r);
    return WithdrawShiftResponse.parse(toShift(r.value));
  });

  // Nurse's own shifts (filled + completed).
  app.get("/api/nurses/me/shifts", pre, async (req, reply) => {
    const r = await service.listMine(db(), req.actor!);
    if (!r.ok) return fail(reply, r);
    return NurseShiftsResponse.parse({ shifts: r.value.map(toShift) });
  });
}
