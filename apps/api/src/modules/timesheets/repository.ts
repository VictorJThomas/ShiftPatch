import { workedMinutes } from "@shiftpatch/contracts";
import { and, desc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { agencies, shifts, timesheets, userProfiles } from "../../db/schema/index.js";
import type { Tx } from "../audit/audit.js";
import { type AgencyScope, assertAgencyScope, assertNetworkScope, type NetworkScope } from "../authz/scope.js";

type Q = Db | Tx;
type Status = "submitted" | "approved" | "disputed";

/** Cap per list: most recent first, so a long history can't make a response unbounded. */
export const TIMESHEETS_LIMIT = 200;

const rowColumns = {
  id: timesheets.id,
  shiftId: timesheets.shiftId,
  shiftDate: shifts.shiftDate,
  role: shifts.role,
  startTime: shifts.startTime,
  endTime: shifts.endTime,
  agencyId: shifts.agencyId,
  agencyName: agencies.name,
  nurseId: timesheets.nurseId,
  nurseName: userProfiles.fullName,
  clockIn: timesheets.clockIn,
  clockOut: timesheets.clockOut,
  breakMinutes: timesheets.breakMinutes,
  note: timesheets.note,
  status: timesheets.status,
  submittedAt: timesheets.submittedAt,
  reviewedAt: timesheets.reviewedAt,
  reviewNote: timesheets.reviewNote,
};
type RawRow = Awaited<ReturnType<typeof listByNurse>>[number];

const hhmm = (t: string) => t.slice(0, 5);
/** Row -> API shape: HH:MM times, ISO instants, worked minutes derived (never stored). */
export function toTimesheetRow(r: RawRow) {
  const clockIn = hhmm(r.clockIn), clockOut = hhmm(r.clockOut);
  return {
    id: r.id, shiftId: r.shiftId, shiftDate: r.shiftDate, role: r.role, startTime: hhmm(r.startTime), endTime: hhmm(r.endTime),
    agencyId: r.agencyId, agencyName: r.agencyName, nurseId: r.nurseId, nurseName: r.nurseName ?? "Unknown nurse",
    clockIn, clockOut, breakMinutes: r.breakMinutes, workedMinutes: workedMinutes(clockIn, clockOut, r.breakMinutes),
    note: r.note, status: r.status, submittedAt: r.submittedAt.toISOString(), reviewedAt: r.reviewedAt?.toISOString() ?? null, reviewNote: r.reviewNote,
  };
}

const base = (q: Q) =>
  q
    .select(rowColumns)
    .from(timesheets)
    .innerJoin(shifts, eq(shifts.id, timesheets.shiftId))
    .innerJoin(agencies, eq(agencies.id, shifts.agencyId))
    .leftJoin(userProfiles, eq(userProfiles.userId, timesheets.nurseId));

const live = (status: Status | undefined): (SQL | undefined)[] => [isNull(timesheets.deletedAt), isNull(shifts.deletedAt), status ? eq(timesheets.status, status) : undefined];
const newest = [desc(timesheets.submittedAt), desc(timesheets.id)] as const;

/** The nurse's own timesheets (callers pass the authenticated actor's id). */
export const listByNurse = (q: Q, nurseId: string) =>
  base(q).where(and(eq(timesheets.nurseId, nurseId), ...live(undefined))).orderBy(...newest).limit(TIMESHEETS_LIMIT);

export function listByAgency(q: Q, scope: AgencyScope, status?: Status) {
  assertAgencyScope(scope);
  return base(q).where(and(inArray(shifts.agencyId, [...scope.agencyIds]), ...live(status))).orderBy(...newest).limit(TIMESHEETS_LIMIT);
}

export function listByNetworks(q: Q, scopes: NetworkScope[], status?: Status) {
  for (const s of scopes) assertNetworkScope(s);
  return base(q).where(and(inArray(shifts.networkId, scopes.map((s) => s.networkId)), ...live(status))).orderBy(...newest).limit(TIMESHEETS_LIMIT);
}

/** One timesheet in API shape (inside the writing tx, after the write). */
export async function viewOf(q: Q, id: string) {
  const [row] = await base(q).where(eq(timesheets.id, id));
  return toTimesheetRow(row!);
}

/** The timesheet's own facts plus its shift's ownership, for authorization and state checks. `lock` = FOR UPDATE on the timesheet row. */
export async function findForReview(q: Q, id: string, opts: { lock?: boolean } = {}) {
  const query = q
    .select({
      id: timesheets.id, status: timesheets.status, nurseId: timesheets.nurseId, shiftId: timesheets.shiftId,
      agencyId: shifts.agencyId, networkId: shifts.networkId, shiftDate: shifts.shiftDate, startTime: shifts.startTime, endTime: shifts.endTime, role: shifts.role,
      shiftStatus: shifts.status, shiftClaimedBy: shifts.claimedBy,
    })
    .from(timesheets)
    .innerJoin(shifts, eq(shifts.id, timesheets.shiftId))
    .where(and(eq(timesheets.id, id), isNull(timesheets.deletedAt), isNull(shifts.deletedAt)));
  const [row] = await (opts.lock ? query.for("update", { of: timesheets }) : query);
  return row ?? null;
}

/** The nurse's timesheet for a shift, locked. Call after locking the shift row (lock order: shift, then timesheet). */
export async function findByShiftNurse(tx: Tx, shiftId: string, nurseId: string) {
  const [row] = await tx
    .select({
      id: timesheets.id, status: timesheets.status, clockIn: timesheets.clockIn, clockOut: timesheets.clockOut, breakMinutes: timesheets.breakMinutes,
    })
    .from(timesheets)
    .where(and(eq(timesheets.shiftId, shiftId), eq(timesheets.nurseId, nurseId), isNull(timesheets.deletedAt)))
    .for("update");
  return row ?? null;
}

export async function insertTimesheet(tx: Tx, t: { id: string; shiftId: string; nurseId: string; clockIn: string; clockOut: string; breakMinutes: number; note: string | null; now: Date }) {
  await tx.insert(timesheets).values({
    id: t.id, shiftId: t.shiftId, nurseId: t.nurseId, clockIn: t.clockIn, clockOut: t.clockOut, breakMinutes: t.breakMinutes, note: t.note,
    status: "submitted", submittedAt: t.now, createdAt: t.now, updatedAt: t.now,
  });
}

/** disputed -> submitted with new values; the review fields are cleared in the same statement (DB check reviewed_iff_not_submitted). */
export async function resubmitRow(tx: Tx, f: { id: string; clockIn: string; clockOut: string; breakMinutes: number; note: string | null; now: Date }): Promise<boolean> {
  const rows = await tx
    .update(timesheets)
    .set({ clockIn: f.clockIn, clockOut: f.clockOut, breakMinutes: f.breakMinutes, note: f.note, status: "submitted", submittedAt: f.now, reviewedBy: null, reviewedAt: null, reviewNote: null, updatedAt: f.now })
    .where(and(eq(timesheets.id, f.id), eq(timesheets.status, "disputed")))
    .returning({ id: timesheets.id });
  return rows.length === 1;
}

/** submitted -> approved | disputed. false = no longer submitted. */
export async function reviewRow(tx: Tx, f: { id: string; status: "approved" | "disputed"; reviewedBy: string; reviewNote: string | null; now: Date }): Promise<boolean> {
  const rows = await tx
    .update(timesheets)
    .set({ status: f.status, reviewedBy: f.reviewedBy, reviewedAt: f.now, reviewNote: f.reviewNote, updatedAt: f.now })
    .where(and(eq(timesheets.id, f.id), eq(timesheets.status, "submitted")))
    .returning({ id: timesheets.id });
  return rows.length === 1;
}

/** filled -> completed; claimed_by stays (DB check shifts_claimed_iff_filled_or_completed). false = not filled any more. */
export async function completeShiftRow(tx: Tx, shiftId: string, now: Date): Promise<boolean> {
  const rows = await tx
    .update(shifts)
    .set({ status: "completed", updatedAt: now })
    .where(and(eq(shifts.id, shiftId), eq(shifts.status, "filled"), isNull(shifts.deletedAt)))
    .returning({ id: shifts.id });
  return rows.length === 1;
}
