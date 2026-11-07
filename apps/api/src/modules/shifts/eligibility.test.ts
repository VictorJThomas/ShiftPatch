import { describe, expect, it } from "vitest";
import { ineligibility, isEligible, roleMatchesLicense, todayIn } from "./eligibility.js";

const lic = (expiresOn: string | null, status = "verified") => ({ status, expiresOn });
const shift = { shiftDate: "2026-10-04" };

describe("isEligible (ARCHITECTURE §5.3)", () => {
  it("valid on today and on the shift day", () => expect(isEligible([lic("2027-01-01")], shift, "2026-10-01")).toBe(true));
  it("pending counts (a fresh upload is not lapsed)", () => expect(isEligible([lic("2027-01-01", "pending")], shift, "2026-10-01")).toBe(true));
  it("rejected never counts", () => expect(isEligible([lic("2027-01-01", "rejected")], shift, "2026-10-01")).toBe(false));
  it("expired before today", () => expect(isEligible([lic("2026-06-01")], shift, "2026-10-01")).toBe(false));
  it("expires before the shift day even though valid today", () => expect(isEligible([lic("2026-10-03")], shift, "2026-10-01")).toBe(false));
  it("expiry on the shift day is still valid (inclusive)", () => expect(isEligible([lic("2026-10-04")], shift, "2026-10-01")).toBe(true));
  it("past shift: today is the bar, not the old shift date", () => {
    expect(isEligible([lic("2026-10-10")], shift, "2026-10-20")).toBe(false);
    expect(isEligible([lic("2026-10-20")], shift, "2026-10-20")).toBe(true);
  });
  it("no licenses, or one without an expiry, is not eligible", () => {
    expect(isEligible([], shift, "2026-10-01")).toBe(false);
    expect(isEligible([lic(null)], shift, "2026-10-01")).toBe(false);
  });
  it("one good license among bad ones is enough", () => expect(isEligible([lic("2020-01-01"), lic("2027-01-01")], shift, "2026-10-01")).toBe(true));
});

describe("isEligible: soft-deleted", () => {
  it("a soft-deleted license never counts", () => {
    expect(isEligible([{ ...lic("2027-01-01"), deletedAt: new Date() }], shift, "2026-10-01")).toBe(false);
    expect(isEligible([{ ...lic("2027-01-01"), deletedAt: null }], shift, "2026-10-01")).toBe(true);
  });
});

describe("ineligibility (which exact 403 text)", () => {
  it("null when eligible", () => expect(ineligibility([lic("2027-01-01")], shift, "2026-10-01")).toBeNull());
  it("no licenses -> none", () => expect(ineligibility([], shift, "2026-10-01")).toBe("none"));
  it("only rejected -> none, even when unexpired", () => expect(ineligibility([lic("2027-01-01", "rejected")], shift, "2026-10-01")).toBe("none"));
  it("only soft-deleted -> none", () => expect(ineligibility([{ ...lic("2027-01-01"), deletedAt: new Date() }], shift, "2026-10-01")).toBe("none"));
  it("only expired -> expired (spec text)", () => expect(ineligibility([lic("2026-06-01")], shift, "2026-10-01")).toBe("expired"));
  it("pending but expired -> expired", () => expect(ineligibility([lic("2026-06-01", "pending")], shift, "2026-10-01")).toBe("expired"));
  it("expired + rejected -> expired (a usable-status license exists)", () =>
    expect(ineligibility([lic("2026-06-01"), lic("2027-01-01", "rejected")], shift, "2026-10-01")).toBe("expired"));
  it("valid today but lapses before the shift day -> expired", () => expect(ineligibility([lic("2026-10-03")], shift, "2026-10-01")).toBe("expired"));
});

describe("todayIn", () => {
  it("uses the shift timezone, not UTC", () => {
    const now = new Date("2026-10-02T02:30:00Z"); // still Oct 1 evening in New York
    expect(todayIn("America/New_York", now)).toBe("2026-10-01");
    expect(todayIn("UTC", now)).toBe("2026-10-02");
  });
});

describe("roleMatchesLicense", () => {
  it("null license type applies no filter (seed nurses)", () => expect(roleMatchesLicense(null, "RN")).toBe(true));
  it("populated license type must equal the shift role", () => {
    expect(roleMatchesLicense("LPN", "LPN")).toBe(true);
    expect(roleMatchesLicense("LPN", "RN")).toBe(false);
  });
});
