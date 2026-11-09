"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  AgencyCoverageResponse,
  CancelShiftResponse,
  CreateShiftResponse,
  WithdrawShiftResponse,
  type AgencyCoverageQuery,
  type CancelShiftRequest,
  type CreateShiftRequest,
} from "@shiftpatch/contracts";
import { apiFetch } from "@/lib/api-client";
import { formatShiftEcho } from "@/lib/format";
import { showError } from "@/lib/format-error";
import { agencyKey } from "@/lib/query-client";
import { SHIFT_NURSE_KEY } from "@/lib/shift-nurse";
import { useSessionStore, type AgencyMembership } from "@/stores/session";
import { notify } from "@/stores/toasts";

/** The active membership (name + role). `canWrite` is a UI hint only: the API checks every write. */
export function useActiveMembership(): { membership: AgencyMembership | undefined; canWrite: boolean } {
  const agencies = useSessionStore((s) => s.agencies);
  const activeId = useSessionStore((s) => s.activeAgencyId);
  const membership = agencies.find((a) => a.agencyId === activeId);
  return { membership, canWrite: !!membership && membership.role !== "viewer" };
}

/**
 * Server-side filtered coverage rows (Shift + claimedByName). Params are part of the key, so each filter combination
 * caches on its own; empty params = the unfiltered query that also feeds the chip counts. Keys sit under
 * `["agency", id, "shifts", ...]`, so every write's invalidation covers them.
 */
export function useAgencyCoverage(params: AgencyCoverageQuery = {}) {
  const agencyId = useSessionStore((s) => s.activeAgencyId);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const query = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: agencyKey(agencyId, "shifts", "coverage", params),
    queryFn: ({ signal }) => apiFetch(`/api/agencies/${encodeURIComponent(agencyId ?? "")}/coverage${query}`, { schema: AgencyCoverageResponse, signal }),
    enabled: !!agencyId,
    // keep the last rows while a filter changes, but never another agency's rows after a switch
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === agencyId ? prev : undefined),
  });
}

/** Writes change this agency's list and every cross-agency shift list (nurse marketplace, admin dashboard). */
function invalidateShifts(queryClient: QueryClient, agencyId: string | null) {
  void queryClient.invalidateQueries({ queryKey: agencyKey(agencyId, "shifts") });
  void queryClient.invalidateQueries({ queryKey: SHIFT_NURSE_KEY });
  void queryClient.invalidateQueries({ queryKey: ["shifts"] });
}

export function useCreateShift() {
  const queryClient = useQueryClient();
  const agencyId = useSessionStore((s) => s.activeAgencyId);
  return useMutation({
    mutationFn: (body: CreateShiftRequest) => apiFetch("/api/shifts", { method: "POST", body, schema: CreateShiftResponse }),
    onSuccess: (shift) => notify.success("Shift posted", `${shift.role} · ${formatShiftEcho(shift)}`),
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
