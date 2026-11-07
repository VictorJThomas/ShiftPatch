import type { Shift } from "@shiftpatch/contracts";

export interface ShiftRow {
  id: string;
  agencyId: string;
  agencyName: string;
  role: string;
  shiftDate: string;
  startTime: string; // Postgres `time`: HH:MM:SS
  endTime: string;
  status: string;
  claimedBy: string | null;
}

/** Domain row -> the exact spec shape. Explicit keys: a new column can never leak into a response. */
export const toShift = (r: ShiftRow): Shift => ({
  id: r.id,
  agencyId: r.agencyId,
  agencyName: r.agencyName,
  role: r.role as Shift["role"],
  date: r.shiftDate,
  startTime: r.startTime.slice(0, 5),
  endTime: r.endTime.slice(0, 5),
  status: r.status as Shift["status"],
  claimedBy: r.claimedBy,
});
