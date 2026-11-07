// Pure credential rules (ARCHITECTURE §5.3). No I/O: callers load the licenses. Reused by the matchable filter and (next slice) claim.

export interface LicenseFact {
  status: "pending" | "verified" | "rejected" | string;
  expiresOn: string | null; // YYYY-MM-DD
  deletedAt?: Date | null; // soft-deleted licenses never count
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
 * Soft-deleted rows are ignored here too, so the rule holds even if a caller forgets to filter them.
 */
export function isEligible(licenses: readonly LicenseFact[], shift: { shiftDate: string }, today: string): boolean {
  const needed = today > shift.shiftDate ? today : shift.shiftDate; // ISO dates compare lexically
  return licenses.some((l) => !l.deletedAt && l.status !== "rejected" && l.expiresOn !== null && l.expiresOn >= needed);
}

/**
 * Why a claim is refused, for the two exact 403 texts: `none` = no usable license at all (none, soft-deleted or only rejected),
 * `expired` = a non-rejected license exists but does not cover today and the shift day. `null` = eligible.
 */
export function ineligibility(licenses: readonly LicenseFact[], shift: { shiftDate: string }, today: string): "expired" | "none" | null {
  if (isEligible(licenses, shift, today)) return null;
  return licenses.some((l) => !l.deletedAt && l.status !== "rejected") ? "expired" : "none";
}

/** License-type match applies only when the nurse's license type is populated (seed nurses have none). */
export const roleMatchesLicense = (licenseType: string | null, shiftRole: string): boolean => licenseType === null || licenseType === shiftRole;
