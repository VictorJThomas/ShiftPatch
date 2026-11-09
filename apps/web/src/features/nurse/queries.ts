"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  CancelShiftResponse,
  ClaimShiftResponse,
  ListShiftsResponse,
  NurseCredentialsResponse,
  NurseShiftsResponse,
  UploadCredentialResponse,
  type Shift,
  type ShiftRole,
} from "@shiftpatch/contracts";
import { apiFetch } from "@/lib/api-client";
import { formatDate, formatShiftWhen } from "@/lib/format";
import { showError } from "@/lib/format-error";
import { notify } from "@/stores/toasts";
import { credentialLabel } from "@/lib/credential-label";

/** Server-side filters of GET /api/shifts (all optional, ANDed). `matchable` = only shifts the nurse's credentials qualify for. */
export interface ShiftParams {
  matchable?: boolean;
  role?: ShiftRole;
  date?: string;
  /** Server-side status filter (the marketplace only ever asks for "open"). */
  status?: "open";
}

/**
 * Nurse server state. Marketplace lists live under `["shifts", ...]` (one prefix invalidates every view);
 * the nurse's own data under `["nurse", ...]`. Filtered lists carry their params in the key.
 */
export const nurseKeys = {
  shifts: ["shifts"] as const,
  openShifts: ["shifts", "all"] as const,
  matchable: ["shifts", "matchable"] as const,
  shiftList: (params: ShiftParams) => ["shifts", "list", params] as const,
  myShifts: ["nurse", "my-shifts"] as const,
  credentials: ["nurse", "credentials"] as const,
};

export function shiftsPath({ matchable, role, date, status }: ShiftParams): string {
  const qs = new URLSearchParams();
  if (matchable) qs.set("matchable", "true");
  if (role) qs.set("role", role);
  if (date) qs.set("date", date);
  if (status) qs.set("status", status);
  const s = qs.toString();
  return s ? `/api/shifts?${s}` : "/api/shifts";
}

const onlyOpen = (shifts: Shift[]) => shifts.filter((s) => s.status === "open");

/** Every open shift in the nurse's network, unfiltered: the source of the chip counts. */
export function useOpenShifts() {
  return useQuery({
    queryKey: nurseKeys.openShifts,
    queryFn: ({ signal }) => apiFetch(shiftsPath({}), { schema: ListShiftsResponse, signal }),
    select: (d) => onlyOpen(d.shifts),
  });
}

/** Open shifts this nurse's credentials qualify for, unfiltered. */
export function useMatchableShifts() {
  return useQuery({
    queryKey: nurseKeys.matchable,
    queryFn: ({ signal }) => apiFetch(shiftsPath({ matchable: true }), { schema: ListShiftsResponse, signal }),
    select: (d) => onlyOpen(d.shifts),
  });
}

/** The visible list: the server filters by role/date. Keeps the previous list on screen while a new filter loads. */
export function useFilteredShifts(params: ShiftParams, enabled: boolean) {
  return useQuery({
    queryKey: nurseKeys.shiftList(params),
    queryFn: ({ signal }) => apiFetch(shiftsPath({ ...params, status: "open" }), { schema: ListShiftsResponse, signal }),
    select: (d) => d.shifts,
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useMyShifts() {
  return useQuery({
    queryKey: nurseKeys.myShifts,
    queryFn: ({ signal }) => apiFetch("/api/nurses/me/shifts", { schema: NurseShiftsResponse, signal }),
    select: (d) => d.shifts,
  });
}

export function useCredentials() {
  return useQuery({
    queryKey: nurseKeys.credentials,
    queryFn: ({ signal }) => apiFetch("/api/nurses/me/credentials", { schema: NurseCredentialsResponse, signal }),
  });
}

const invalidateShifts = (qc: QueryClient) =>
  Promise.all([qc.invalidateQueries({ queryKey: nurseKeys.shifts }), qc.invalidateQueries({ queryKey: nurseKeys.myShifts })]);

export function useClaimShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shift: Shift) => apiFetch(`/api/shifts/${encodeURIComponent(shift.id)}/claim`, { method: "POST", schema: ClaimShiftResponse }),
    onSuccess: (_data, shift) => notify.success("Shift claimed", `${shift.role} · ${formatShiftWhen(shift)}`),
    onError: showError,
    // Also on error: a 409 means someone else got it, so the list must drop it.
    onSettled: () => invalidateShifts(qc),
  });
}

export function useCancelShift() {
  const qc = useQueryClient();
  return useMutation({
    // Nurses may only cancel in advance; no-show is the agency's call (API 403).
    mutationFn: (shift: Shift) =>
      apiFetch(`/api/shifts/${encodeURIComponent(shift.id)}/cancel`, { method: "POST", body: { reason: "advance" }, schema: CancelShiftResponse }),
    onSuccess: (_data, shift) => notify.success("Shift cancelled", `${shift.agencyName} has been notified.`),
    onError: showError,
    onSettled: () => invalidateShifts(qc),
  });
}

export function useUploadCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => apiFetch("/api/nurses/me/credentials", { method: "POST", body: form, schema: UploadCredentialResponse }),
    onSuccess: (_data, form) => {
      // Echo what was submitted so the nurse can check it (type + expiry), not a generic "uploaded".
      const type = String(form.get("type")) as "license" | "tb_screening" | "other";
      const licenseType = form.get("licenseType") as ShiftRole | null;
      const expiresOn = form.get("expiresOn");
      const label = credentialLabel({ type, licenseType });
      notify.success("Credential submitted", `${label} · ${typeof expiresOn === "string" && expiresOn ? `expires ${formatDate(expiresOn)}` : "no expiry date"} · waiting for review`);
      // licenseValid (and so the matchable list) may change with a renewed license.
      return Promise.all([qc.invalidateQueries({ queryKey: nurseKeys.credentials }), qc.invalidateQueries({ queryKey: nurseKeys.shifts })]);
    },
    onError: showError,
  });
}
