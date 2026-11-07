// Pure credential rules (ARCHITECTURE §5.3). No I/O: callers load the licenses. Reused by the matchable filter and (next slice) claim.

export interface LicenseFact {
  status: "pending" | "verified" | "rejected" | string;
  expiresOn: string | null; // YYYY-MM-DD
}

/** `YYYY-MM-DD` of `now` in the shift's IANA timezone (en-CA formats as ISO). */
const formatters = new Map<string, Intl.DateTimeFormat>();
export const todayIn = (timezone: string, now: Date): string => {
  let f = formatters.get(timezone);
  if (!f) formatters.set(timezone, (f = new Intl.DateTimeFormat("en-CA", { timeZone: timezone })));
  return f.format(now);
};

/**
 * Eligible when at least one non-rejected license is valid today AND on the day of the work (pending counts: "lapsed" means expired).
 * `licenses` must already exclude soft-deleted rows.
 */
export function isEligible(licenses: readonly LicenseFact[], shift: { shiftDate: string }, today: string): boolean {
  const needed = today > shift.shiftDate ? today : shift.shiftDate; // ISO dates compare lexically
  return licenses.some((l) => l.status !== "rejected" && l.expiresOn !== null && l.expiresOn >= needed);
}

/** License-type match applies only when the nurse's license type is populated (seed nurses have none). */
export const roleMatchesLicense = (licenseType: string | null, shiftRole: string): boolean => licenseType === null || licenseType === shiftRole;
