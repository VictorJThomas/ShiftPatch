// Templates are pure: whitelisted fields only, escaped, one-line subjects, no credential/health detail (ARCHITECTURE §10).
import { describe, expect, it } from "vitest";
import { PermanentMailError, renderTemplate } from "./templates.js";

const shift = { shiftId: "shift-1", role: "RN", date: "2026-12-05", startTime: "07:00", endTime: "19:00", agencyName: "Sunrise Health Staffing" };
const CASES: [string, Record<string, unknown>, string][] = [
  ["shift.posted", { ...shift, facilityName: "Mercy North" }, "New RN shift on 2026-12-05"],
  ["shift.claimed.agency", { ...shift, nurseName: "Ana Ruiz" }, "Ana Ruiz claimed your RN shift on 2026-12-05"],
  ["shift.claimed.nurse", shift, "You're booked: RN on 2026-12-05"],
  ["credential.submitted", { nurseName: "Ana Ruiz" }, "Credential awaiting review"],
  ["credential.reviewed", { outcome: "verified" }, "Your credential was verified"],
  ["credential.reviewed", { outcome: "rejected" }, "Your credential was rejected"],
  ["credential.expiring", { expiresOn: "2026-12-20" }, "A credential expires on 2026-12-20"],
  ["credential.expired", { audience: "nurse", expiresOn: "2026-11-01" }, "A credential has expired"],
  ["credential.expired", { audience: "admin", nurseName: "Ana Ruiz" }, "A credential has expired"],
  ["shift.nurse_license_lapses", { ...shift, nurseName: "Ana Ruiz" }, "Booked nurse's license lapses before 2026-12-05"],
  ["shift.reminder", shift, "Reminder: RN shift 2026-12-05 07:00"],
  ["shift.unfilled", shift, "Unfilled: RN shift 2026-12-05 07:00"],
];

describe("notification templates", () => {
  it.each(CASES)("%s renders subject, text and html", (template, payload, subject) => {
    const m = renderTemplate(template, payload);
    expect(m.subject).toBe(subject);
    expect(m.text.length).toBeGreaterThan(0);
    expect(m.html).toContain("<h2");
    for (const out of [m.subject, m.text, m.html]) {
      expect(out).not.toMatch(/\bTB\b|tuberculosis|license document|https?:\/\//i); // no health data, no links without appUrl
    }
    expect(m.subject).not.toMatch(/[\r\n]/);
  });

  it("escapes HTML in every value and keeps subjects on one line", () => {
    const evil = `<script>alert("x")</script>`;
    for (const [template, payload] of CASES) {
      const m = renderTemplate(template, Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, k === "outcome" || k === "audience" ? v : `${evil}\r\nBcc: x`])));
      expect(m.html).not.toContain("<script>");
      expect(m.subject).not.toMatch(/[\r\n]/);
    }
  });

  it("a missing field is a PermanentMailError", () => {
    expect(() => renderTemplate("shift.posted", { role: "RN" })).toThrow(PermanentMailError);
    expect(() => renderTemplate("credential.submitted", {})).toThrow(PermanentMailError);
    expect(() => renderTemplate("credential.expired", { audience: "nurse" })).toThrow(PermanentMailError);
    expect(() => renderTemplate("credential.expired", { audience: "admin" })).toThrow(PermanentMailError);
    expect(() => renderTemplate("credential.expired", { audience: "other", expiresOn: "2026-01-01" })).toThrow(PermanentMailError);
  });

  it("credential.reviewed rejects an unknown outcome", () => {
    expect(() => renderTemplate("credential.reviewed", { outcome: "pending" })).toThrow(PermanentMailError);
    expect(() => renderTemplate("credential.reviewed", {})).toThrow(PermanentMailError);
  });

  it("extra payload keys never reach the output", () => {
    for (const [template, payload] of CASES) {
      const m = renderTemplate(template, { ...payload, objectKey: "credentials/SECRETKEY", fileName: "scan-SECRETNAME.pdf", type: "tb_screening", licenseNumber: "RN-SECRET" });
      for (const out of [m.subject, m.text, m.html]) expect(out).not.toMatch(/SECRET|tb_screening/);
    }
  });

  it("posted: facility row only when given; expired admin variant carries no date", () => {
    expect(renderTemplate("shift.posted", { ...shift, facilityName: null }).text).not.toContain("Facility");
    expect(renderTemplate("shift.posted", { ...shift, facilityName: "Mercy North" }).text).toContain("Facility: Mercy North");
    expect(renderTemplate("credential.expired", { audience: "admin", nurseName: "Ana Ruiz", expiresOn: "2026-01-01" }).text).not.toContain("2026-01-01");
  });

  it("html carries every payload value that the text shows (escaped), including the intro", () => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const tricky = `O'Neil & <b>Co</b>`;
    for (const [template, payload] of CASES) {
      const p = Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, k === "outcome" || k === "audience" || typeof v !== "string" ? v : `${v} ${tricky}`]));
      const m = renderTemplate(template, p);
      for (const v of Object.values(p).filter((x): x is string => typeof x === "string")) {
        if (m.text.includes(v)) expect(m.html, `${template}: ${v}`).toContain(esc(v));
      }
      expect(m.html).toContain(esc(m.text.split("\n")[0]!)); // the intro line
    }
    expect(renderTemplate("shift.nurse_license_lapses", { ...shift, nurseName: "Ana Ruiz" }).html).toContain("Ana Ruiz");
  });

  it("appUrl adds the sign-in footer to every template and changes nothing else", () => {
    const cancelled = { ...shift, reason: "advance" };
    const plain = renderTemplate("shift.cancelled", cancelled);
    const withUrl = renderTemplate("shift.cancelled", cancelled, { appUrl: "https://app.example.com" });
    expect(withUrl.text).toBe(`${plain.text}\n\nSign in to ShiftPatch: https://app.example.com`);
    expect(withUrl.html.replace(/<p>Sign in to ShiftPatch: .*?<\/p>/, "")).toBe(plain.html);
    expect(plain.text).not.toContain("https://");
    for (const [template, payload] of CASES) expect(renderTemplate(template, payload, { appUrl: "https://app.example.com" }).html).toContain("https://app.example.com");
  });
});
