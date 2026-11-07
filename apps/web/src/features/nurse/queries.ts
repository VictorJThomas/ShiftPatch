"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  CancelShiftResponse,
  ClaimShiftResponse,
  ListShiftsResponse,
  NurseCredentialsResponse,
  NurseShiftsResponse,
  UploadCredentialResponse,
  type Shift,
} from "@shiftpatch/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formatShiftWhen } from "@/lib/format";
import { notify } from "@/stores/toasts";

/**
 * Nurse server state. Marketplace lists live under `["shifts", ...]` (one prefix invalidates both views);
 * the nurse's own data under `["nurse", ...]`.
 */
export const nurseKeys = {
  shifts: ["shifts"] as const,
  openShifts: ["shifts", "all"] as const,
  matchable: ["shifts", "matchable"] as const,
  myShifts: ["nurse", "my-shifts"] as const,
  credentials: ["nurse", "credentials"] as const,
};

/** Server text verbatim (e.g. "Credential expired, cannot claim shift"), never a guess. */
export const showError = (err: unknown) => notify.error(err instanceof ApiError ? err.message : "Something went wrong. Try again.");

const onlyOpen = (shifts: Shift[]) => shifts.filter((s) => s.status === "open");

/** Every open shift in the nurse's network (GET /api/shifts filtered client-side). */
export function useOpenShifts() {
  return useQuery({
    queryKey: nurseKeys.openShifts,
    queryFn: ({ signal }) => apiFetch("/api/shifts", { schema: ListShiftsResponse, signal }),
    select: (d) => onlyOpen(d.shifts),
  });
}

/** Open shifts this nurse's credentials qualify for. */
export function useMatchableShifts() {
  return useQuery({
    queryKey: nurseKeys.matchable,
    queryFn: ({ signal }) => apiFetch("/api/shifts?matchable=true", { schema: ListShiftsResponse, signal }),
    select: (d) => onlyOpen(d.shifts),
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
    onSuccess: () => {
      notify.success("Credential uploaded", "It is waiting for review.");
      // licenseValid (and so the matchable list) may change with a renewed license.
      return Promise.all([qc.invalidateQueries({ queryKey: nurseKeys.credentials }), qc.invalidateQueries({ queryKey: nurseKeys.shifts })]);
    },
    onError: showError,
  });
}
