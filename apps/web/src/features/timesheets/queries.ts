"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  TimesheetResponse,
  TimesheetsResponse,
  type DisputeTimesheetRequest,
  type SubmitTimesheetRequest,
  type TimesheetRow,
  type TimesheetStatus,
} from "@shiftpatch/contracts";
import { apiFetch } from "@/lib/api-client";
import { formatShiftWhen } from "@/lib/format";
import { showError } from "@/lib/format-error";
import { agencyKey } from "@/lib/query-client";
import { useSessionStore } from "@/stores/session";
import { notify } from "@/stores/toasts";
import { formatWorked } from "./format";

export type StatusFilter = TimesheetStatus | "all";

/** The nurse's own timesheets live under the `["nurse", ...]` prefix; the agency's under `["agency", id, ...]`; the admin's under `["admin", ...]`. */
export const MY_TIMESHEETS_KEY = ["nurse", "timesheets"] as const;

const path = (status: StatusFilter) => (status === "all" ? "/api/timesheets" : `/api/timesheets?status=${status}`);

/** GET /api/timesheets for the signed-in agency (its active agency) or admin (its network). The API decides the scope. */
export function useTimesheets(status: StatusFilter) {
  const role = useSessionStore((s) => s.user?.role);
  const agencyId = useSessionStore((s) => s.activeAgencyId);
  const key = role === "admin" ? (["admin", "timesheets", status] as const) : agencyKey(agencyId, "timesheets", status);
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch(path(status), { schema: TimesheetsResponse, signal }),
    select: (d) => d.timesheets,
    enabled: role === "admin" || (role === "agency" && !!agencyId),
  });
}

/** GET /api/nurses/me/timesheets. */
export function useMyTimesheets() {
  return useQuery({
    queryKey: MY_TIMESHEETS_KEY,
    queryFn: ({ signal }) => apiFetch("/api/nurses/me/timesheets", { schema: TimesheetsResponse, signal }),
    select: (d) => d.timesheets,
  });
}

/** A write changes timesheet lists everywhere and, on approval, the shift (filled -> completed) in every shift list. */
function invalidateAll(qc: QueryClient) {
  for (const queryKey of [MY_TIMESHEETS_KEY, ["admin"], ["shifts"], ["nurse", "my-shifts"], ["agency"]]) void qc.invalidateQueries({ queryKey });
}

export function useSubmitTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shiftId, body }: { shiftId: string; body: SubmitTimesheetRequest }) =>
      apiFetch(`/api/shifts/${encodeURIComponent(shiftId)}/timesheet`, { method: "POST", body, schema: TimesheetResponse }),
    onSuccess: (t) => notify.success("Hours submitted", `${t.role} · ${formatShiftWhen({ date: t.shiftDate, startTime: t.startTime, endTime: t.endTime })} · ${formatWorked(t.workedMinutes)}`),
    onError: showError,
    onSettled: () => invalidateAll(qc),
  });
}

export function useApproveTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (t: TimesheetRow) => apiFetch(`/api/timesheets/${encodeURIComponent(t.id)}/approve`, { method: "POST", schema: TimesheetResponse }),
    onSuccess: (t) => notify.success("Hours approved", `${t.nurseName} · ${t.role} · ${formatWorked(t.workedMinutes)}. The shift is complete.`),
    onError: showError,
    onSettled: () => invalidateAll(qc),
  });
}

export function useDisputeTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DisputeTimesheetRequest }) =>
      apiFetch(`/api/timesheets/${encodeURIComponent(id)}/dispute`, { method: "POST", body, schema: TimesheetResponse }),
    onSuccess: (t) => notify.success("Hours disputed", `${t.nurseName} is notified and can resubmit.`),
    onError: showError,
    onSettled: () => invalidateAll(qc),
  });
}
