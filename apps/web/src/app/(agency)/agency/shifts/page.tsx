"use client";

import { useQuery } from "@tanstack/react-query";
import { AgencyShiftsResponse } from "@shiftpatch/contracts";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { apiFetch } from "@/lib/api-client";
import { agencyKey } from "@/lib/query-client";
import { useSessionStore } from "@/stores/session";

/** Placeholder shell: proves the agency-scoped query key + X-Agency-Id wiring. The real shift UI lands in a later stage. */
export default function AgencyShiftsPage() {
  const agencyId = useSessionStore((s) => s.activeAgencyId);
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: agencyKey(agencyId, "shifts"),
    queryFn: () => apiFetch(`/api/agencies/${agencyId}/shifts`, { schema: AgencyShiftsResponse }),
    enabled: !!agencyId,
  });

  return (
    <>
      <div className="row between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="page-h">Shifts</h1>
          <p className="muted" style={{ fontSize: 14 }}>
            Facility-local time, 24-hour.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void refetch()} aria-busy={isFetching}>
          <Icon name="refresh" />
          Refresh
        </button>
      </div>
      {isPending ? (
        <div className="skel" style={{ height: 96 }} aria-busy="true" />
      ) : error ? (
        <EmptyState icon="alert-circle" title="Could not load shifts">
          {error.message}
        </EmptyState>
      ) : data.shifts.length === 0 ? (
        <EmptyState icon="inbox" title="No shifts posted yet">
          Shifts your agency posts will appear here.
        </EmptyState>
      ) : (
        <p data-testid="agency-shift-count" className="muted">
          {data.shifts.length} {data.shifts.length === 1 ? "shift" : "shifts"} for this agency.
        </p>
      )}
    </>
  );
}
