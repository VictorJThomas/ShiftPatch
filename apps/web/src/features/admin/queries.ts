import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built
import {
  AdminAgencyResponse, AdminCoverageResponse, AdminNurseResponse, AdminUsersResponse, type AdminUserType, AuditLogResponse, ListShiftsResponse,
  ReviewCredentialResponse,
} from "@shiftpatch/contracts";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { showError } from "@/lib/format-error";
import { SHIFT_NURSE_KEY } from "@/lib/shift-nurse";
import { notify } from "@/stores/toasts";
import { type AuditFilters, auditParams, coverageParams, POLL_MS, type SortDir, type StatusFilter } from "./model";

export const adminKeys = {
  shifts: ["admin", "shifts"] as const,
  audit: (f: AuditFilters) => ["admin", "audit", f] as const,
  coverage: (p: string) => ["admin", "coverage", p] as const,
  users: (type: AdminUserType, q: string) => ["admin", "users", type, q] as const,
  nurse: (id: string) => ["admin", "nurse", id] as const,
  agency: (id: string) => ["admin", "agency", id] as const,
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

export interface CoverageFilters {
  status: StatusFilter;
  agencyId: string;
  q: string;
  page: number;
  sort: SortDir;
}

/** GET /api/admin/coverage: one page of rows + total + per-status counts. Params are the key; polls like the stat tiles. */
export function useAdminCoverage(filters: CoverageFilters) {
  const params = coverageParams(filters).toString();
  return useQuery({
    queryKey: adminKeys.coverage(params),
    queryFn: ({ signal }) => apiFetch(`/api/admin/coverage?${params}`, { schema: AdminCoverageResponse, signal }),
    placeholderData: keepPreviousData,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}

/** GET /api/admin/users?type&q, keyset cursor ("Load more"). */
export function useAdminUsers(type: AdminUserType, q: string) {
  return useInfiniteQuery({
    queryKey: adminKeys.users(type, q),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const p = new URLSearchParams({ type, limit: "25" });
      if (q.trim()) p.set("q", q.trim());
      if (pageParam) p.set("cursor", pageParam);
      return apiFetch(`/api/admin/users?${p}`, { schema: AdminUsersResponse, signal });
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

export const useAdminNurse = (id: string | null) =>
  useQuery({ queryKey: adminKeys.nurse(id ?? ""), enabled: !!id, queryFn: ({ signal }) => apiFetch(`/api/admin/nurses/${id}`, { schema: AdminNurseResponse, signal }) });

export const useAdminAgency = (id: string | null) =>
  useQuery({ queryKey: adminKeys.agency(id ?? ""), enabled: !!id, queryFn: ({ signal }) => apiFetch(`/api/admin/agencies/${id}`, { schema: AdminAgencyResponse, signal }) });

/** PATCH /api/credentials/:id/review. `label` only feeds the toast ("Nursing license verified"). */
export function useReviewCredential(nurseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "verified" | "rejected"; label: string }) =>
      apiFetch(`/api/credentials/${id}/review`, { method: "PATCH", body: { status }, schema: ReviewCredentialResponse }),
    onSuccess: (_r, v) => {
      notify.success(`${v.label} ${v.status}`, "The nurse's credential status was updated.");
    },
    onError: showError,
    // settled: a failed review (409 already reviewed) also means our view is stale; the review writes an audit row too.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.nurse(nurseId) });
      void qc.invalidateQueries({ queryKey: SHIFT_NURSE_KEY });
      void qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });
}
