"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built
import { PageHeader } from "@/components/ui/PageHeader";
import { TimesheetList } from "@/features/timesheets/TimesheetList";

/**
 * Real timesheets of the admin's network (GET /api/timesheets), filterable by status. A network admin approves or disputes
 * submitted hours like the owning agency. The table (and its test ID) always renders, with an empty state when there are none.
 */
export function Timesheets() {
  return (
    <>
      <PageHeader title="Timesheets" description="Hours nurses submit for their filled shifts. Facility-local, 24-hour. Approving completes the shift." />
      <section className="card" aria-label="Timesheets">
        <TimesheetList canReview tableTestId="timesheet-table" />
      </section>
    </>
  );
}
