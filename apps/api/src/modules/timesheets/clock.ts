// Pure wall-clock helpers: shift times are HH:MM in the shift's IANA timezone, so "has it started" compares local strings.

const formatters = new Map<string, Intl.DateTimeFormat>();

/** `YYYY-MM-DDTHH:MM` of `now` in `timezone` (lexically comparable with `${shiftDate}T${startTime}`). */
export function localDateTime(timezone: string, now: Date): string {
  let f = formatters.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    formatters.set(timezone, f);
  }
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** True once the shift's start (date + start time, in its own timezone) is at or before `now`. */
export const shiftHasStarted = (s: { shiftDate: string; startTime: string; timezone: string }, now: Date): boolean =>
  `${s.shiftDate}T${s.startTime.slice(0, 5)}` <= localDateTime(s.timezone, now);

/** "7h 30m" / "45m" / "8h". Used in emails; the web formats its own. */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60), m = total % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}
