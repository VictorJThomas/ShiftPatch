/**
 * Timesheets (additive; ARCHITECTURE §4 "timesheets"). Times are wall-clock HH:MM in the shift's timezone, like the shift's own
 * start/end: clockOut <= clockIn means the nurse clocked out the next day.
 *
 * This file must not import from ./index.js (index re-exports it; a cycle would read undefined primitives), so the few
 * primitives it needs are declared here with the same definitions.
 */
import { z } from "zod";

const Id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid id");
const HhMm = z.iso.time({ precision: -1 });
const IsoDate = z.iso.date();
const IsoInstant = z.iso.datetime({ offset: true });

export const TimesheetStatus = z.enum(["submitted", "approved", "disputed"]);

export const BREAK_MINUTES_MAX = 240;
export const WORKED_MINUTES_MAX = 16 * 60;
export const NOTE_MAX = 500;
export const REASON_MAX = 500;

/** Exact texts for the timesheet routes (the shared `ErrorMessage` object is left untouched). */
export const TimesheetErrorMessage = {
  shiftNotFound: "Shift not found", // 404 submit: missing, or not the caller's shift (no existence leak)
  timesheetNotFound: "Timesheet not found", // 404 approve / dispute: missing or out of the caller's scope
  shiftNotStarted: "The shift has not started yet, hours can be submitted once it starts", // 400 submit before the shift start
  shiftNotFilled: "Shift is not filled", // 409 submit / approve when the shift is no longer filled
  alreadySubmitted: "Timesheet already submitted", // 409 submit while submitted or approved
  notAwaitingReview: "Timesheet is not awaiting review", // 409 approve / dispute from any status but submitted
  invalidTime: "Time must be HH:MM", // 400
  invalidBreak: "Break must be between 0 and 240 minutes", // 400
  invalidWorked: "Worked time must be more than 0 minutes and at most 16 hours", // 400
  noteTooLong: "Note must be 500 characters or fewer", // 400
  reasonRequired: "A reason is required", // 400 dispute
  reasonTooLong: "Reason must be 500 characters or fewer", // 400 dispute
} as const;

const Hm = z.iso.time({ precision: -1, error: TimesheetErrorMessage.invalidTime });

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** (out - in) mod 24 h minus the break. Clock-out at or before clock-in is the next day. Equal times give 0 before the break. */
export function workedMinutes(clockIn: string, clockOut: string, breakMinutes: number): number {
  const span = (((toMinutes(clockOut) - toMinutes(clockIn)) % 1440) + 1440) % 1440;
  return span - breakMinutes;
}

/** POST /api/shifts/:id/timesheet. Strict: unknown keys are a 400, never silently dropped. */
export const SubmitTimesheetRequest = z
  .strictObject({
    clockIn: Hm,
    clockOut: Hm,
    breakMinutes: z
      .number(TimesheetErrorMessage.invalidBreak)
      .int(TimesheetErrorMessage.invalidBreak)
      .min(0, TimesheetErrorMessage.invalidBreak)
      .max(BREAK_MINUTES_MAX, TimesheetErrorMessage.invalidBreak)
      .default(0),
    note: z.string().trim().max(NOTE_MAX, TimesheetErrorMessage.noteTooLong).optional(),
  })
  .refine(
    (t) => {
      const w = workedMinutes(t.clockIn, t.clockOut, t.breakMinutes);
      return w > 0 && w <= WORKED_MINUTES_MAX;
    },
    { message: TimesheetErrorMessage.invalidWorked, path: ["clockOut"] },
  );

/** POST /api/timesheets/:id/dispute. */
export const DisputeTimesheetRequest = z.strictObject({
  reason: z.string().trim().min(1, TimesheetErrorMessage.reasonRequired).max(REASON_MAX, TimesheetErrorMessage.reasonTooLong),
});

export const TimesheetIdParams = z.object({ id: Id });
export const ListTimesheetsQuery = z.object({ status: TimesheetStatus.optional() });

/** One timesheet with its shift's facts, the agency and the nurse's name. Same shape on every route. No health or credential data. */
export const TimesheetRow = z.strictObject({
  id: Id,
  shiftId: Id,
  shiftDate: IsoDate,
  role: z.enum(["RN", "LPN", "CNA"]),
  startTime: HhMm, // the shift's scheduled start / end
  endTime: HhMm,
  agencyId: Id,
  agencyName: z.string().min(1),
  nurseId: Id,
  nurseName: z.string().min(1),
  clockIn: HhMm,
  clockOut: HhMm,
  breakMinutes: z.number().int(),
  workedMinutes: z.number().int(),
  note: z.string().nullable(),
  status: TimesheetStatus,
  submittedAt: IsoInstant,
  reviewedAt: IsoInstant.nullable(),
  reviewNote: z.string().nullable(), // the agency's dispute reason
});
export const TimesheetResponse = TimesheetRow;
export const TimesheetsResponse = z.strictObject({ timesheets: z.array(TimesheetRow) });

export type TimesheetStatus = z.infer<typeof TimesheetStatus>;
export type SubmitTimesheetRequest = z.input<typeof SubmitTimesheetRequest>;
export type DisputeTimesheetRequest = z.input<typeof DisputeTimesheetRequest>;
export type ListTimesheetsQuery = z.infer<typeof ListTimesheetsQuery>;
export type TimesheetRow = z.infer<typeof TimesheetRow>;
export type TimesheetsResponse = z.infer<typeof TimesheetsResponse>;
