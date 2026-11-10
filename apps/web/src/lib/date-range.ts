/** Inclusive range of ISO dates ("YYYY-MM-DD"); "" = that side is open. ISO dates compare correctly as strings. */
export interface DateRange {
  from: string;
  to: string;
}

export const EMPTY_RANGE: DateRange = { from: "", to: "" };

/** Inline message for an impossible range, or null. Shown on the End date field. */
export function dateRangeError({ from, to }: DateRange): string | null {
  return from && to && to < from ? "End date must be on or after the start date" : null;
}

/** True when `date` falls in the range (both ends inclusive, either end optional). */
export function inDateRange(date: string, { from, to }: DateRange): boolean {
  return (!from || date >= from) && (!to || date <= to);
}

/** The range that actually filters: an invalid one filters nothing (its error explains why). */
export function effectiveRange(range: DateRange): DateRange {
  return dateRangeError(range) ? EMPTY_RANGE : range;
}

/** A one-day range ("from" = "to"), which the API can filter with its `date` param. */
export const singleDay = ({ from, to }: DateRange): string | undefined => (from && from === to ? from : undefined);
