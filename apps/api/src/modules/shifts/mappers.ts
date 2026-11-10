import type { CoverageRow, Shift } from "@shiftpatch/contracts";

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

export interface CoverageRowInput extends ShiftRow { claimedByName: string | null }

/** Shared by the agency and admin coverage tables: the Shift shape plus the claimer's name. */
export const toCoverageRow = (r: CoverageRowInput): CoverageRow => ({ ...toShift(r), claimedByName: r.claimedByName });
