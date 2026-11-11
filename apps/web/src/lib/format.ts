export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? ""; // "Sunrise Health Staffing" -> SH, "Maria Lopez" -> ML
  return (first + second).toUpperCase();
}

/** Per-agency band colours (design: Agency-Switcher). Index = position in the user's memberships, so it is stable per user. */
const AGENCY_COLORS = ["#A24A00", "#2F4FA3", "#6B3FA0", "#1F6B3A", "#8A1F4D"] as const;

export function agencyColor(index: number): string {
  return AGENCY_COLORS[Math.max(index, 0) % AGENCY_COLORS.length] ?? AGENCY_COLORS[0];
}

/* ---- Dates & shift times. Always en-US (the dev machine is es-*); times are facility-local 24 h "HH:MM". ---- */

const LOCALE = "en-US";
const dayMonth = new Intl.DateTimeFormat(LOCALE, { weekday: "short", month: "short", day: "numeric" });
const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: "short" });
const fullDate = new Intl.DateTimeFormat(LOCALE, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const dateTime = new Intl.DateTimeFormat(LOCALE, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

interface ShiftTimes {
  startTime: string;
  endTime: string;
}

/** "2026-10-02" -> local midnight Date (`new Date("2026-10-02")` would be UTC and shift a day west of UTC). */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** End at or before start = the shift ends the next day. */
export function isOvernight({ startTime, endTime }: ShiftTimes): boolean {
  return minutes(endTime) <= minutes(startTime);
}

/** Duration in hours, overnight aware: 19:00 -> 07:00 = 12. */
export function shiftHours({ startTime, endTime }: ShiftTimes): number {
  const diff = minutes(endTime) - minutes(startTime);
  return (diff <= 0 ? diff + 24 * 60 : diff) / 60;
}

/** Shift length for display: "12 h", "12 h 30 min", "5 h 58 min" (never a raw float like 5.966666 h). */
export function formatHours(shift: ShiftTimes): string {
  const total = Math.round(shiftHours(shift) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "Fri, Oct 2 · 19:00 → Sat 07:00" (overnight) or "Sat, Oct 3 · 07:00 → 19:00" (same day). */
export function formatShiftWhen(shift: ShiftTimes & { date: string }): string {
  const start = parseIsoDate(shift.date);
  let end = shift.endTime;
  if (isOvernight(shift)) {
    const next = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    end = `${weekday.format(next)} ${end}`;
  }
  return `${dayMonth.format(start)} · ${shift.startTime} → ${end}`;
}

/** "2026-10-02" -> "Fri, Oct 2, 2026". */
export function formatDate(iso: string): string {
  return fullDate.format(parseIsoDate(iso));
}

/** ISO timestamp -> "Oct 2, 2026, 19:05" in the viewer's time zone, 24 h. */
export function formatDateTime(value: string | Date): string {
  return dateTime.format(new Date(value));
}

/** "12 s ago", "3 min ago", "2 h ago", "4 d ago". Future times clamp to "0 s ago". */
export function relativeFrom(value: string | Date, now: Date = new Date()): string {
  const s = Math.max(0, Math.floor((now.getTime() - new Date(value).getTime()) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Live echo under the post-shift date/time inputs: "Sat, Oct 3, 2026 · 07:00 → 19:00 · 12 h · Overnight". */
export function formatShiftEcho(shift: ShiftTimes & { date: string }): string {
  return `${formatDate(shift.date)} · ${shift.startTime} → ${shift.endTime} · ${formatHours(shift)}${isOvernight(shift) ? " · Overnight" : ""}`;
}
