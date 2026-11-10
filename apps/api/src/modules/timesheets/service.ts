import { randomUUID } from "node:crypto";
import { DisputeTimesheetRequest, SubmitTimesheetRequest, TimesheetErrorMessage as Msg, type TimesheetStatus, workedMinutes } from "@shiftpatch/contracts";
import type { Db } from "../../db/client.js";
import { recordAudit, type RequestMeta } from "../audit/audit.js";
import type { Actor } from "../authz/actor.js";
import { can } from "../authz/can.js";
import type { Decision } from "../authz/decision.js";
import { agencyScope, networkScope } from "../authz/scope.js";
import { enqueue } from "../notifications/enqueue.js";
import { agencyManagers, userName, userRecipient } from "../notifications/recipients.js";
import * as shiftRepo from "../shifts/repository.js";
import type { Result } from "../shifts/service.js";
import { formatMinutes, shiftHasStarted } from "./clock.js";
import * as repo from "./repository.js";

// Business operations for timesheets. Every write = business change + audit row + outbox rows in ONE transaction.
// Lock order is always shift row first, then timesheet row, so concurrent submit / approve / cancel can't deadlock.

type Row = Awaited<ReturnType<typeof repo.viewOf>>;
const denied = (d: Decision): Result<never> => ({ ok: false, denied: d as Decision & { allow: false } });
const failed = (status: 403 | 404 | 409, error: string): Result<never> => ({ ok: false, fail: { status, error } });
const firstIssue = (e: { issues: { message: string }[] }) => e.issues[0]?.message ?? "Invalid request";

/** GET /api/nurses/me/timesheets. */
export async function listMine(db: Db, actor: Actor): Promise<Result<Row[]>> {
  const decision = can(actor, "timesheet:list-mine", {});
  if (!decision.allow) return denied(decision);
  return { ok: true, value: (await repo.listByNurse(db, actor.userId)).map(repo.toTimesheetRow) };
}

/** GET /api/timesheets: the active agency's (any member), or the admin's networks. */
export async function list(db: Db, actor: Actor, status?: TimesheetStatus): Promise<Result<Row[]>> {
  const decision = can(actor, "timesheet:list", {});
  if (!decision.allow) return denied(decision);
  const rows = actor.role === "admin"
    ? await repo.listByNetworks(db, actor.networkIds.map((id) => networkScope(actor, id)), status)
    : await repo.listByAgency(db, agencyScope(actor, actor.activeAgencyId!), status); // allow implies a validated active agency
  return { ok: true, value: rows.map(repo.toTimesheetRow) };
}

/** POST /api/shifts/:id/timesheet: the nurse holding a started, filled shift submits (or, after a dispute, resubmits) her hours. */
export async function submit(db: Db, actor: Actor, shiftId: string, body: unknown, meta: RequestMeta, now = new Date()): Promise<Result<Row>> {
  const peek = await shiftRepo.findLiveShift(db, shiftId);
  const first = can(actor, "timesheet:submit", { claimedBy: peek?.claimedBy ?? null });
  // Wrong role = 403. Missing shift, or one this nurse does not hold = the same 404 (no existence leak).
  if (!first.allow && first.reason !== "out_of_scope") return denied(first);
  if (!peek || !first.allow) return failed(404, Msg.shiftNotFound);
  const parsed = SubmitTimesheetRequest.safeParse(body ?? {});
  if (!parsed.success) return { ok: false, invalid: firstIssue(parsed.error) };
  const input = { ...parsed.data, note: parsed.data.note || null };

  return db.transaction(async (tx): Promise<Result<Row>> => {
    const shift = await shiftRepo.findLiveShift(tx, shiftId, { lock: true });
    if (!shift || shift.claimedBy !== actor.userId) return failed(404, Msg.shiftNotFound); // cancelled and re-claimed meanwhile
    const existing = await repo.findByShiftNurse(tx, shift.id, actor.userId);
    if (existing && existing.status !== "disputed") return failed(409, Msg.alreadySubmitted);
    if (shift.status !== "filled") return failed(409, Msg.shiftNotFilled);
    if (!shiftHasStarted(shift, now)) return { ok: false, invalid: Msg.shiftNotStarted };

    const times = { clockIn: input.clockIn.slice(0, 5), clockOut: input.clockOut.slice(0, 5) };
    const common = { ...times, breakMinutes: input.breakMinutes, note: input.note, now };
    let id: string;
    if (existing) {
      id = existing.id;
      if (!(await repo.resubmitRow(tx, { id, ...common }))) return failed(409, Msg.alreadySubmitted);
    } else {
      id = `ts_${randomUUID()}`;
      await repo.insertTimesheet(tx, { id, shiftId: shift.id, nurseId: actor.userId, ...common });
    }
    const worked = workedMinutes(times.clockIn, times.clockOut, input.breakMinutes);
    await recordAudit(tx, {
      ...meta, actorUserId: actor.userId, actorRole: actor.role, networkId: shift.networkId, agencyId: shift.agencyId,
      action: "timesheet.submitted", entityType: "timesheet", entityId: id,
      // The nurse's free-text note stays out of the audit row.
      changes: { status: [existing?.status ?? null, "submitted"], shiftId: [null, shift.id], clockIn: [existing?.clockIn.slice(0, 5) ?? null, times.clockIn], clockOut: [existing?.clockOut.slice(0, 5) ?? null, times.clockOut], breakMinutes: [existing?.breakMinutes ?? null, input.breakMinutes], workedMinutes: worked },
    });
    await enqueue(tx, {
      template: "timesheet.submitted",
      recipients: await agencyManagers(tx, shift.agencyId),
      payload: {
        shiftId: shift.id, role: shift.role, date: shift.shiftDate, startTime: shift.startTime.slice(0, 5), endTime: shift.endTime.slice(0, 5),
        nurseName: await userName(tx, actor.userId), workedTime: formatMinutes(worked), resubmitted: existing ? "yes" : "no",
      },
    });
    return { ok: true, value: await repo.viewOf(tx, id) };
  });
}

type Review = { kind: "approve" } | { kind: "dispute"; reason: string };

async function review(db: Db, actor: Actor, id: string, body: unknown, kind: Review["kind"], meta: RequestMeta, now: Date): Promise<Result<Row>> {
  const peek = await repo.findForReview(db, id);
  // A missing id becomes "" for everyone: no membership matches it, so an agency member gets the same 404 as for a foreign one.
  const decision = can(actor, "timesheet:review", { agencyId: peek?.agencyId ?? "", networkId: peek?.networkId ?? "" });
  if (!decision.allow) {
    // Not a member of the owning agency / not admin of its network = the timesheet does not exist for you. Viewers and nurses: 403.
    return decision.reason === "not_a_member" || decision.reason === "out_of_scope" ? failed(404, Msg.timesheetNotFound) : denied(decision);
  }
  if (!peek) return failed(404, Msg.timesheetNotFound);
  let reason: string | null = null;
  if (kind === "dispute") {
    const parsed = DisputeTimesheetRequest.safeParse(body ?? {});
    if (!parsed.success) return { ok: false, invalid: firstIssue(parsed.error) };
    reason = parsed.data.reason;
  }

  return db.transaction(async (tx): Promise<Result<Row>> => {
    const shift = await shiftRepo.findLiveShift(tx, peek.shiftId, { lock: true }); // shift first, then the timesheet
    const ts = await repo.findForReview(tx, id, { lock: true });
    if (!shift || !ts) return failed(404, Msg.timesheetNotFound);
    if (ts.status !== "submitted") return failed(409, Msg.notAwaitingReview);
    // The nurse may have cancelled after submitting: the hours then belong to a shift nobody holds, so they can't be reviewed.
    if (shift.status !== "filled" || shift.claimedBy !== ts.nurseId) return failed(409, Msg.shiftNotFilled);

    const status = kind === "approve" ? "approved" : "disputed";
    if (!(await repo.reviewRow(tx, { id, status, reviewedBy: actor.userId, reviewNote: reason, now }))) return failed(409, Msg.notAwaitingReview);
    if (kind === "approve" && !(await repo.completeShiftRow(tx, shift.id, now))) return failed(409, Msg.shiftNotFilled); // unreachable under the lock
    await recordAudit(tx, {
      ...meta, actorUserId: actor.userId, actorRole: actor.role, networkId: shift.networkId, agencyId: shift.agencyId,
      action: kind === "approve" ? "timesheet.approved" : "timesheet.disputed", entityType: "timesheet", entityId: id,
      // The dispute reason is free text: it lives on the timesheet row (reviewNote), not in the audit row.
      changes: { status: ["submitted", status], ...(kind === "approve" ? { shiftStatus: ["filled", "completed"] } : {}) },
    });
    const view = await repo.viewOf(tx, id);
    await enqueue(tx, {
      template: kind === "approve" ? "timesheet.approved" : "timesheet.disputed",
      recipients: [await userRecipient(tx, ts.nurseId)],
      payload: {
        shiftId: shift.id, role: shift.role, date: shift.shiftDate, startTime: view.startTime, endTime: view.endTime,
        agencyName: view.agencyName, workedTime: formatMinutes(view.workedMinutes), // the dispute reason is read in the app, never mailed
      },
    });
    return { ok: true, value: view };
  });
}

/** POST /api/timesheets/:id/approve: submitted -> approved, and the shift filled -> completed, in one transaction. */
export const approve = (db: Db, actor: Actor, id: string, meta: RequestMeta, now = new Date()) => review(db, actor, id, undefined, "approve", meta, now);

/** POST /api/timesheets/:id/dispute: submitted -> disputed with a reason; the shift stays filled. */
export const dispute = (db: Db, actor: Actor, id: string, body: unknown, meta: RequestMeta, now = new Date()) => review(db, actor, id, body, "dispute", meta, now);
