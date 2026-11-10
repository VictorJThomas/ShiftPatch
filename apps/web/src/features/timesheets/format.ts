/** 450 -> "7 h 30 min", 45 -> "45 min", 480 -> "8 h". */
export function formatWorked(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h} h ${m} min`;
  return h ? `${h} h` : `${m} min`;
}

/** The scheduled start of a shift has passed in the viewer's clock. A UI hint only: the API checks in the shift's own time zone. */
export function hasStarted(shift: { date: string; startTime: string }, now: Date = new Date()): boolean {
  const [y, mo, d] = shift.date.split("-").map(Number);
  const [h, mi] = shift.startTime.split(":").map(Number);
  return new Date(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0).getTime() <= now.getTime();
}
