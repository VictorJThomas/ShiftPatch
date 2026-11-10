import { describe, expect, it } from "vitest";
import { DisputeTimesheetRequest, SubmitTimesheetRequest, TimesheetErrorMessage as Msg, workedMinutes } from "./index.js";

describe("workedMinutes", () => {
  it("handles same-day, overnight and break", () => {
    expect(workedMinutes("07:00", "19:30", 30)).toBe(720);
    expect(workedMinutes("19:00", "07:00", 0)).toBe(720); // clock-out at or before clock-in = next day
    expect(workedMinutes("07:00", "07:00", 0)).toBe(0);
    expect(workedMinutes("23:30", "00:15", 15)).toBe(30);
  });
});

describe("SubmitTimesheetRequest", () => {
  const ok = { clockIn: "07:00", clockOut: "19:00" };
  it("defaults the break to 0 and trims the note", () => {
    expect(SubmitTimesheetRequest.parse({ ...ok, note: "  hi " })).toEqual({ ...ok, breakMinutes: 0, note: "hi" });
  });
  it.each<[string, unknown, string]>([
    ["break above 240", { ...ok, breakMinutes: 241 }, Msg.invalidBreak],
    ["negative break", { ...ok, breakMinutes: -5 }, Msg.invalidBreak],
    ["zero worked", { clockIn: "07:00", clockOut: "07:00" }, Msg.invalidWorked],
    ["over 16 h", { clockIn: "06:00", clockOut: "23:00" }, Msg.invalidWorked],
    ["note too long", { ...ok, note: "x".repeat(501) }, Msg.noteTooLong],
    ["bad time", { ...ok, clockIn: "7am" }, Msg.invalidTime],
  ])("rejects %s with the exact message", (_n, body, message) => {
    const r = SubmitTimesheetRequest.safeParse(body);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(message);
  });
  it("is strict: an unknown key fails", () => {
    expect(SubmitTimesheetRequest.safeParse({ ...ok, status: "approved" }).success).toBe(false);
  });
});

describe("DisputeTimesheetRequest", () => {
  it("needs a non-blank reason of at most 500 characters", () => {
    expect(DisputeTimesheetRequest.parse({ reason: "  too long break " })).toEqual({ reason: "too long break" });
    expect(DisputeTimesheetRequest.safeParse({ reason: "   " }).error?.issues[0]?.message).toBe(Msg.reasonRequired);
    expect(DisputeTimesheetRequest.safeParse({ reason: "x".repeat(501) }).error?.issues[0]?.message).toBe(Msg.reasonTooLong);
  });
});
