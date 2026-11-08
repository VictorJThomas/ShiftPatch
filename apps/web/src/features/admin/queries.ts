import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built
import { AuditLogResponse, ListShiftsResponse } from "@shiftpatch/contracts";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { type AuditFilters, auditParams, POLL_MS } from "./model";

export const adminKeys = {
  shifts: ["admin", "shifts"] as const,
  audit: (f: AuditFilters) => ["admin", "audit", f] as const,
};

const fetchShifts = ({ signal }: { signal: AbortSignal }) => apiFetch("/api/shifts", { schema: ListShiftsResponse, signal }).then((r) => r.shifts);

/**
 * Every shift in the admin's network (GET /api/shifts). `live` = the dashboard: polls every 15 s while the tab is visible
 * (TanStack Query only, no sockets). Other admin pages read the same cache without polling.
 */
export function useAdminShifts({ live = false }: { live?: boolean } = {}) {
  return useQuery({
    queryKey: adminKeys.shifts,
    queryFn: fetchShifts,
    refetchInterval: live ? POLL_MS : false,
    refetchIntervalInBackground: false,
    ...(live ? { staleTime: 0 } : {}),
  });
}

/** GET /api/audit-logs, newest first, 50 per page, keyset cursor. Filters are part of the key, so a change starts over. */
export function useAuditLog(filters: AuditFilters) {
  return useInfiniteQuery({
    queryKey: adminKeys.audit(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = auditParams(filters);
      if (pageParam) params.set("cursor", pageParam);
      return apiFetch(`/api/audit-logs?${params}`, { schema: AuditLogResponse, signal });
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}
