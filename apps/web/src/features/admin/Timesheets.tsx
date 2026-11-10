"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built
import { Alert } from "@/components/shadcn/alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatShiftWhen, shiftHours } from "@/lib/format";
import { useAdminShifts } from "./queries";

/**
 * There is no timesheet model yet (clock-in/out is out of scope). The only real data shown is completed shifts from
 * GET /api/shifts with their scheduled hours; clocked hours are "—" until clock-in/out exists. Nothing is invented.
 */
export function Timesheets() {
  const q = useAdminShifts();
  const completed = (q.data ?? []).filter((s) => s.status === "completed");
  return (
    <>
      <PageHeader title="Timesheets" description="Clock in and out for filled shifts. Facility-local, 24-hour." />
      <Alert variant="info" role="status" className="mb-4">
        <Icon name="info" />
        <span>Timesheets arrive with clock-in/out. Completed shifts will appear here with their scheduled hours.</span>
      </Alert>
      {/* The table (and its test ID) always renders; a failed shift fetch is reported above it, not instead of it. */}
      {q.isError && !q.data && <ErrorState title="Couldn't load shifts" message={q.error.message} onRetry={() => void q.refetch()} />}
      <section className="card" aria-label="Timesheets">
          <div className="scrollx" aria-busy={q.isPending}>
            <table data-testid="timesheet-table" className="tbl adm-tbl">
              <caption className="sr">Timesheets for completed shifts</caption>
              <thead>
                <tr>
                  <th scope="col">Nurse</th>
                  <th scope="col">Shift</th>
                  <th scope="col">Date</th>
                  <th scope="col">Scheduled hours</th>
                  <th scope="col">Clocked hours</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {completed.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty-cell">
                      <EmptyState icon="clock" title={q.isPending ? "Loading timesheets…" : "No timesheets yet"}>
                        Clock in and clock out times show here once nurses complete their filled shifts.
                      </EmptyState>
                    </td>
                  </tr>
                ) : (
                  completed.map((s) => (
                    <tr key={s.id}>
                      <td className="adm-id">{s.claimedBy ?? "—"}</td>
                      <td>
                        <span className="adm-id">{s.id}</span> · {s.agencyName}
                      </td>
                      <td className="num">{formatShiftWhen(s)}</td>
                      <td className="num">{shiftHours(s)} h</td>
                      <td className="num muted">—</td>
                      <td>
                        <StatusBadge status={s.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
    </>
  );
}
