"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  AgencyShiftsResponse,
  CancelShiftResponse,
  CreateShiftResponse,
  WithdrawShiftResponse,
  type CancelShiftRequest,
  type CreateShiftRequest,
} from "@shiftpatch/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { agencyKey } from "@/lib/query-client";
import { useSessionStore, type AgencyMembership } from "@/stores/session";
import { notify } from "@/stores/toasts";

const FALLBACK_ERROR = "Something went wrong. Try again.";
const showError = (err: unknown) => notify.error(err instanceof ApiError ? err.message : FALLBACK_ERROR);

/** The active membership (name + role). `canWrite` is a UI hint only: the API checks every write. */
export function useActiveMembership(): { membership: AgencyMembership | undefined; canWrite: boolean } {
  const agencies = useSessionStore((s) => s.agencies);
  const activeId = useSessionStore((s) => s.activeAgencyId);
  const membership = agencies.find((a) => a.agencyId === activeId);
  return { membership, canWrite: !!membership && membership.role !== "viewer" };
}

export function useAgencyShifts() {
  const agencyId = useSessionStore((s) => s.activeAgencyId);
  return useQuery({
    queryKey: agencyKey(agencyId, "shifts"),
    queryFn: ({ signal }) => apiFetch(`/api/agencies/${agencyId}/shifts`, { schema: AgencyShiftsResponse, signal }),
    enabled: !!agencyId,
  });
}

/** Writes change this agency's list and every cross-agency shift list (nurse marketplace, admin dashboard). */
function invalidateShifts(queryClient: QueryClient, agencyId: string | null) {
  void queryClient.invalidateQueries({ queryKey: agencyKey(agencyId, "shifts") });
  void queryClient.invalidateQueries({ queryKey: ["shifts"] });
}

export function useCreateShift() {
  const queryClient = useQueryClient();
  const agencyId = useSessionStore((s) => s.activeAgencyId);
  return useMutation({
    mutationFn: (body: CreateShiftRequest) => apiFetch("/api/shifts", { method: "POST", body, schema: CreateShiftResponse }),
    onSuccess: () => notify.success("Shift posted"),
    onError: showError,
    onSettled: () => invalidateShifts(queryClient, agencyId),
  });
}

export function useCancelShift() {
  const queryClient = useQueryClient();
  const agencyId = useSessionStore((s) => s.activeAgencyId);
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: CancelShiftRequest["reason"] }) =>
      apiFetch(`/api/shifts/${encodeURIComponent(id)}/cancel`, { method: "POST", body: { reason } satisfies CancelShiftRequest, schema: CancelShiftResponse }),
    onSuccess: () => notify.success("Shift cancelled"),
    onError: showError,
    onSettled: () => invalidateShifts(queryClient, agencyId),
  });
}

export function useWithdrawShift() {
  const queryClient = useQueryClient();
  const agencyId = useSessionStore((s) => s.activeAgencyId);
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/shifts/${encodeURIComponent(id)}/withdraw`, { method: "POST", schema: WithdrawShiftResponse }),
    onSuccess: () => notify.success("Shift withdrawn"),
    onError: showError,
    onSettled: () => invalidateShifts(queryClient, agencyId),
  });
}

/**
 * Switch the active agency: subsequent requests carry the new `X-Agency-Id`, the previous agency's cache is dropped
 * (no flash of its data, nothing stale kept), and the new agency's queries load fresh. Open dialogs/forms close because
 * the shifts view is keyed by the agency id.
 */
export function useSwitchAgency() {
  const queryClient = useQueryClient();
  return (id: string) => {
    const previous = useSessionStore.getState().activeAgencyId;
    if (id === previous) return;
    useSessionStore.getState().setActiveAgency(id);
    if (previous) queryClient.removeQueries({ queryKey: ["agency", previous] });
    void queryClient.invalidateQueries({ queryKey: ["agency", id] });
  };
}
