import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatShiftWhen, isOvernight, parseIsoDate, relativeFrom, shiftHours } from "./format";

describe("format", () => {
  it("parseIsoDate keeps the calendar day (no UTC shift)", () => {
    const d = parseIsoDate("2026-10-02");
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 2, 0]);
  });

  it("formatShiftWhen: overnight ends the next day, same-day keeps one date", () => {
    expect(formatShiftWhen({ date: "2026-10-02", startTime: "19:00", endTime: "07:00" })).toBe("Fri, Oct 2 · 19:00 → Sat 07:00");
    expect(formatShiftWhen({ date: "2026-10-03", startTime: "07:00", endTime: "19:00" })).toBe("Sat, Oct 3 · 07:00 → 19:00");
    expect(formatShiftWhen({ date: "2026-10-31", startTime: "23:00", endTime: "07:00" })).toBe("Sat, Oct 31 · 23:00 → Sun 07:00");
  });

  it("shiftHours and isOvernight are overnight aware", () => {
    expect(shiftHours({ startTime: "19:00", endTime: "07:00" })).toBe(12);
    expect(shiftHours({ startTime: "07:00", endTime: "19:30" })).toBe(12.5);
    expect(isOvernight({ startTime: "19:00", endTime: "07:00" })).toBe(true);
    expect(isOvernight({ startTime: "07:00", endTime: "19:00" })).toBe(false);
  });

  it("formatDate / formatDateTime use en-US and 24 h", () => {
    expect(formatDate("2026-10-02")).toBe("Fri, Oct 2, 2026");
    expect(formatDateTime(new Date(2026, 9, 2, 19, 5))).toBe("Oct 2, 2026, 19:05");
    expect(formatDateTime(new Date(2026, 9, 2, 0, 5).toISOString())).toBe("Oct 2, 2026, 00:05");
  });

  it("relativeFrom", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    expect(relativeFrom("2026-11-07T11:59:48Z", now)).toBe("12 s ago");
    expect(relativeFrom(new Date("2026-11-07T11:57:00Z"), now)).toBe("3 min ago");
    expect(relativeFrom("2026-11-07T10:00:00Z", now)).toBe("2 h ago");
    expect(relativeFrom("2026-11-08T00:00:00Z", now)).toBe("0 s ago");
  });
});
