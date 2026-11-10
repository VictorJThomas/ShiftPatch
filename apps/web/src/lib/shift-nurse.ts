import "@/lib/zod-csp"; // first: the contracts import below builds zod schemas
import { ShiftNurseResponse } from "@shiftpatch/contracts";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

/** Key prefix for every cached claiming-nurse lookup; invalidate it after anything that changes a nurse or a claim. */
export const SHIFT_NURSE_KEY = ["shift-nurse"] as const;

/**
 * GET /api/shifts/:id/nurse: the nurse who claimed a shift. Owner/manager and the network admin only (viewers get 404,
 * so callers never enable this for them). Pass null to keep the query idle. Shared by the agency and admin screens.
 */
export function useShiftNurse(shiftId: string | null) {
  return useQuery({
    queryKey: [...SHIFT_NURSE_KEY, shiftId] as const,
    queryFn: ({ signal }) => apiFetch(`/api/shifts/${encodeURIComponent(shiftId ?? "")}/nurse`, { schema: ShiftNurseResponse, signal }),
    enabled: !!shiftId,
  });
}
