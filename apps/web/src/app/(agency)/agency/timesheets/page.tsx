"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { useActiveMembership } from "@/features/agency/queries";
import { TimesheetList } from "@/features/timesheets/TimesheetList";
import { useSessionStore } from "@/stores/session";

/** Hours submitted for this agency's filled shifts. Owners and managers approve or dispute; viewers read. Keyed by agency: a switch resets the filter. */
export default function AgencyTimesheetsPage() {
  const agencyId = useSessionStore((s) => s.activeAgencyId);
  const { canWrite } = useActiveMembership();
  return (
    <>
      <PageHeader
        title="Timesheets"
        description={canWrite ? "Approve the hours nurses submit, or dispute them with a reason. Approving completes the shift." : "Hours nurses submitted for this agency's shifts. Owners and managers approve or dispute them."}
      />
      <section className="card" aria-label="Timesheets">
        <TimesheetList key={agencyId ?? "none"} canReview={canWrite} />
      </section>
    </>
  );
}
