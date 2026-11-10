import { describe, expect, it } from "vitest";
import { dateRangeError, effectiveRange, inDateRange, singleDay } from "./date-range";

describe("date range", () => {
  it("is inclusive at both ends and open when a side is empty", () => {
    const r = { from: "2026-10-02", to: "2026-10-04" };
    expect(["2026-10-01", "2026-10-02", "2026-10-04", "2026-10-05"].map((d) => inDateRange(d, r))).toEqual([false, true, true, false]);
    expect(inDateRange("2030-01-01", { from: "2026-10-02", to: "" })).toBe(true);
    expect(inDateRange("2020-01-01", { from: "", to: "2026-10-04" })).toBe(true);
    expect(inDateRange("2026-10-03", { from: "", to: "" })).toBe(true);
  });

  it("rejects an end before the start and then filters nothing", () => {
    const bad = { from: "2026-10-04", to: "2026-10-02" };
    expect(dateRangeError(bad)).toBe("End date must be on or after the start date");
    expect(effectiveRange(bad)).toEqual({ from: "", to: "" });
    expect(dateRangeError({ from: "2026-10-04", to: "2026-10-04" })).toBeNull();
    expect(dateRangeError({ from: "2026-10-04", to: "" })).toBeNull();
  });

  it("detects a one-day range", () => {
    expect(singleDay({ from: "2026-10-04", to: "2026-10-04" })).toBe("2026-10-04");
    expect(singleDay({ from: "2026-10-04", to: "" })).toBeUndefined();
    expect(singleDay({ from: "", to: "" })).toBeUndefined();
  });
});
