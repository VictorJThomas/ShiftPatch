import "@/lib/zod-csp"; // first: the contracts import below builds zod schemas
import { INSPECTION_MAX_DAYS, INSPECTION_MAX_NURSES, type CreateInspectionPackageRequest, type InspectionPackage, type InspectionPackageDetailResponse } from "@shiftpatch/contracts";

/** Pure form + display logic for the inspection package screens (unit-tested; no React, no network). */
export interface FormValues {
  from: string;
  to: string;
  nurseIds: string[];
  includeDocuments: boolean;
  includeTbDocuments: boolean;
}

const DAY_MS = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Last 90 days, ending today. */
export function defaultPeriod(now = new Date()): { from: string; to: string } {
  return { from: isoDay(new Date(now.getTime() - 90 * DAY_MS)), to: isoDay(now) };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** null = fine. Mirrors the API rule: to >= from, at most 366 days (inclusive). */
export function periodError(from: string, to: string): string | null {
  if (!ISO.test(from) || !ISO.test(to)) return "Choose a start and end date";
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
  if (Number.isNaN(days) || days < 0) return "The end date must be on or after the start date";
  if (days >= INSPECTION_MAX_DAYS) return `Choose a period of at most ${INSPECTION_MAX_DAYS} days`;
  return null;
}

export function formError(v: FormValues): string | null {
  const p = periodError(v.from, v.to);
  if (p) return p;
  if (v.nurseIds.length === 0) return "Select at least one nurse";
  if (v.nurseIds.length > INSPECTION_MAX_NURSES) return `Select at most ${INSPECTION_MAX_NURSES} nurses`;
  if (v.includeTbDocuments && !v.includeDocuments) return "TB documents require attaching license documents";
  return null;
}

/** Turning documents off also turns TB documents off (the TB toggle is only meaningful with documents on). */
export const setIncludeDocuments = (v: FormValues, on: boolean): FormValues => ({ ...v, includeDocuments: on, includeTbDocuments: on ? v.includeTbDocuments : false });

export const toggleNurse = (v: FormValues, id: string): FormValues => ({ ...v, nurseIds: v.nurseIds.includes(id) ? v.nurseIds.filter((n) => n !== id) : [...v.nurseIds, id] });

/** A selection can only hold candidates of the current period: drop ids that are no longer candidates. */
export const pruneSelection = (v: FormValues, candidateIds: readonly string[]): FormValues => {
  const keep = v.nurseIds.filter((id) => candidateIds.includes(id));
  return keep.length === v.nurseIds.length ? v : { ...v, nurseIds: keep };
};

export const buildRequest = (v: FormValues): CreateInspectionPackageRequest => ({
  nurseIds: v.nurseIds, from: v.from, to: v.to, includeDocuments: v.includeDocuments, includeTbDocuments: v.includeDocuments && v.includeTbDocuments,
});

export type PackageState = "active" | "revoked" | "expired";
export const packageState = (p: Pick<InspectionPackage, "revoked" | "expired">): PackageState => (p.revoked ? "revoked" : p.expired ? "expired" : "active");

/** "Expires in 3 h 20 min" / "Expires in 12 min" / "Expired". Rounded down to the minute. */
export function expiryText(expiresAt: string, now = new Date()): string {
  const ms = Date.parse(expiresAt) - now.getTime();
  if (!(ms > 0)) return "Expired";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "Expires in under a minute";
  const h = Math.floor(mins / 60);
  return h > 0 ? `Expires in ${h} h ${mins % 60} min` : `Expires in ${mins} min`;
}

const csvCell = (value: string | number | null): string => {
  let s = value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export const CSV_HEADER = [
  "Nurse", "Email", "License type", "License number", "Issuing state", "License expires", "License status", "Verified by", "Verified at", "TB screening on file", "TB screened on", "TB status",
];

/** One row per license (a nurse without a license gets one row). Summary only: never documents, keys, URLs or TB results. */
export function toCsv(detail: Pick<InspectionPackageDetailResponse, "nurses">): string {
  const rows: (string | number | null)[][] = [];
  for (const n of detail.nurses) {
    const tb = [n.tb.onFile ? "Yes" : "No", n.tb.screenedOn, n.tb.status];
    if (n.licenses.length === 0) rows.push([n.name, n.email, null, null, null, null, "none", null, null, ...tb]);
    for (const l of n.licenses) rows.push([n.name, n.email, l.licenseType, l.number, l.issuingState, l.expiresOn, l.status, l.verifiedByName, l.verifiedAt, ...tb]);
  }
  return [CSV_HEADER, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
