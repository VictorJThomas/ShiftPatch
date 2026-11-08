import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built
import type { AuditLogEntry, Shift } from "@shiftpatch/contracts";
import { parseIsoDate } from "@/lib/format";

/* Pure helpers for the admin screens: no React, no fetch, so they are unit-tested directly. */

export type ShiftStatus = Shift["status"];
export type StatusFilter = "all" | ShiftStatus;
export const SHIFT_STATUSES: readonly ShiftStatus[] = ["open", "filled", "cancelled", "completed"];
export const PAGE_SIZE = 25;
export const POLL_MS = 15_000;

export interface Agency {
  id: string;
  name: string;
}

/** Distinct agencies present in the data, sorted by name. */
export function agenciesOf(shifts: readonly Shift[]): Agency[] {
  const map = new Map<string, string>();
  for (const s of shifts) map.set(s.agencyId, s.agencyName);
  return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export type StatusCounts = Record<ShiftStatus, number>;

export function countByStatus(shifts: readonly Shift[]): StatusCounts {
  const c: StatusCounts = { open: 0, filled: 0, cancelled: 0, completed: 0 };
  for (const s of shifts) c[s.status]++;
  return c;
}

/** Filled / (open + filled), rounded %. `null` when nothing is staffable (no division by zero, no fake 0 %). */
export function fillRate(c: Pick<StatusCounts, "open" | "filled">): number | null {
  const total = c.open + c.filled;
  return total === 0 ? null : Math.round((c.filled / total) * 100);
}

export interface AgencyCoverage extends Agency {
  counts: StatusCounts;
  rate: number | null;
}

export function coverageByAgency(shifts: readonly Shift[]): AgencyCoverage[] {
  return agenciesOf(shifts).map((a) => {
    const counts = countByStatus(shifts.filter((s) => s.agencyId === a.id));
    return { ...a, counts, rate: fillRate(counts) };
  });
}

export interface ShiftFilters {
  agencyId: string; // "all" or an id
  status: StatusFilter;
  search: string;
}
export const NO_FILTERS: ShiftFilters = { agencyId: "all", status: "all", search: "" };

/** Agency + search, without the status (the status chips show counts for everything else that matches). */
export function matchesBase(s: Shift, f: ShiftFilters): boolean {
  if (f.agencyId !== "all" && s.agencyId !== f.agencyId) return false;
  const q = f.search.trim().toLowerCase();
  if (!q) return true;
  return [s.id, s.agencyName, s.agencyId, s.claimedBy ?? ""].some((v) => v.toLowerCase().includes(q));
}

export function filterShifts(shifts: readonly Shift[], f: ShiftFilters): Shift[] {
  return shifts.filter((s) => matchesBase(s, f) && (f.status === "all" || s.status === f.status));
}

export type SortDir = "asc" | "desc";

/** By date then start time; ties by id so the order is stable across polls. */
export function sortByDate(shifts: readonly Shift[], dir: SortDir): Shift[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...shifts].sort((a, b) => sign * (`${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`) || a.id.localeCompare(b.id)));
}

export interface Page<T> {
  items: T[];
  page: number; // 1-based, clamped
  pages: number;
  from: number; // 1-based index of the first item, 0 when empty
  to: number;
  total: number;
}

export function paginate<T>(items: readonly T[], page: number, size = PAGE_SIZE): Page<T> {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * size;
  const slice = items.slice(start, start + size);
  return { items: slice, page: p, pages, from: total === 0 ? 0 : start + 1, to: start + slice.length, total };
}

/* ---- Audit log ---- */

/** Every action the API writes today (grep `action: "` in apps/api/src/modules). Unknown codes still render as their code. */
export const AUDIT_ACTIONS: Record<string, string> = {
  "shift.created": "Posted shift",
  "shift.claimed": "Claimed shift",
  "shift.cancelled": "Cancelled shift",
  "shift.withdrawn": "Withdrew shift",
  "credential.uploaded": "Uploaded credential",
  "auth.login": "Signed in",
  "auth.login_failed": "Failed sign-in",
  "auth.logout": "Signed out",
  "auth.refresh_reuse_detected": "Session reuse blocked",
};
export const AUDIT_ENTITY_TYPES: Record<string, string> = {
  shift: "Shift",
  credential: "Credential",
  user: "User",
  refresh_token_family: "Session",
};
export const actionLabel = (code: string) => AUDIT_ACTIONS[code] ?? code;
export const entityLabel = (type: string) => AUDIT_ENTITY_TYPES[type] ?? type;

export interface AuditFilters {
  action: string; // "" = all
  entityType: string;
  agencyId: string;
  from: string; // "YYYY-MM-DD" local, "" = open
  to: string;
}
export const NO_AUDIT_FILTERS: AuditFilters = { action: "", entityType: "", agencyId: "", from: "", to: "" };

/** True when both dates are set and the range is inverted (the API would answer 400). */
export const invalidRange = (f: AuditFilters) => f.from !== "" && f.to !== "" && f.from > f.to;

/** Local-day bounds as ISO instants: `from` = 00:00:00.000, `to` = 23:59:59.999 of the viewer's day. */
export function dayBound(date: string, end: boolean): string {
  const d = parseIsoDate(date);
  if (end) d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/** Query string for GET /api/audit-logs (without the cursor). An inverted range is left out rather than sent. */
export function auditParams(f: AuditFilters, limit = 50): URLSearchParams {
  const p = new URLSearchParams({ limit: String(limit) });
  if (f.action) p.set("action", f.action);
  if (f.entityType) p.set("entityType", f.entityType);
  if (f.agencyId) p.set("agencyId", f.agencyId);
  if (!invalidRange(f)) {
    if (f.from) p.set("from", dayBound(f.from, false));
    if (f.to) p.set("to", dayBound(f.to, true));
  }
  return p;
}

const show = (v: unknown): string => (v === null || v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v));

/** `{ status: ["open","filled"], reason: "advance" }` -> ["status: open → filled", "reason: advance"]. */
export function formatChanges(changes: AuditLogEntry["changes"]): string[] {
  if (!changes) return [];
  return Object.entries(changes).map(([field, v]) =>
    Array.isArray(v) && v.length === 2 ? `${field}: ${show(v[0])} → ${show(v[1])}` : `${field}: ${show(v)}`,
  );
}
