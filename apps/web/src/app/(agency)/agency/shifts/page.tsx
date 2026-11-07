"use client";

import { AgencyShiftsView } from "@/features/agency/agency-shifts-view";
import { useSessionStore } from "@/stores/session";

/** Agency home. Keyed by the active agency: switching resets filters and closes any open dialog or form. */
export default function AgencyShiftsPage() {
  const agencyId = useSessionStore((s) => s.activeAgencyId);
  return <AgencyShiftsView key={agencyId ?? "none"} />;
}
