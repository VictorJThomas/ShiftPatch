"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import Link from "next/link";
import { useState } from "react";
import type { Shift, ShiftRole } from "@shiftpatch/contracts";
import { AppBar, UserAvatar } from "@/components/shells/NurseShell";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { OfflineBanner, useOnline } from "@/components/ui/OfflineBanner";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { parseIsoDate } from "@/lib/format";
import { useClaimShift, useCredentials, useMatchableShifts, useOpenShifts } from "./queries";
import { ShiftCard, ShiftDetailsDialog } from "./ShiftCard";

type RoleFilter = "all" | ShiftRole;
const ROLES: ShiftRole[] = ["RN", "LPN", "CNA"];
const chipDate = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Lapsed-license fallback (ARCHITECTURE §12.4, design Nurse-License-Lapsed): when nothing matches the nurse's
 * credentials but open shifts exist, show those with Claim ENABLED. The backend decides; its 403 text reaches
 * the notification banner verbatim. Exported for tests.
 */
export function pickShiftSource(matchable: Shift[], open: Shift[], licenseValid: boolean | undefined) {
  if (matchable.length > 0) return { shifts: matchable, notice: null };
  // Nothing open at all: still warn a nurse whose license lapsed (they need to act before shifts appear).
  if (open.length === 0) return { shifts: matchable, notice: licenseValid === false ? ("expired" as const) : null };
  return { shifts: open, notice: licenseValid === false ? ("expired" as const) : ("nomatch" as const) };
}

function LicenseNotice({ kind }: { kind: "expired" | "nomatch" }) {
  if (kind === "expired") {
    return (
      <div className="alert al-warn nurse-notice" role="status">
        <Icon name="cal-x" size="lg" />
        <div>
          <b>Your license has expired.</b> Upload a renewed license to claim shifts.
          <Link href="/nurse/credentials" className="nurse-notice-link">
            Upload renewed license
            <Icon name="arrow" size="sm" />
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="alert al-info" role="status">
      <Icon name="info" size="lg" />
      <div>
        <b>No shifts match your credentials right now</b> Here are all open shifts. Claiming checks your credentials.
      </div>
    </div>
  );
}

export function Marketplace() {
  const matchable = useMatchableShifts();
  const open = useOpenShifts();
  const credentials = useCredentials(); // a failure just means the neutral copy
  const claim = useClaimShift();
  const online = useOnline();

  const [date, setDate] = useState("all");
  const [role, setRole] = useState<RoleFilter>("all");
  const [details, setDetails] = useState<Shift | null>(null);

  const loading = matchable.isPending || open.isPending;
  const failed = matchable.isError || open.isError;
  const { shifts, notice } = loading || failed ? { shifts: [], notice: null } : pickShiftSource(matchable.data, open.data, credentials.data?.licenseValid);

  // Filters: a selection that no longer exists (e.g. its last shift was claimed) falls back to "all".
  const dates = [...new Set(shifts.map((s) => s.date))].sort();
  const activeDate = dates.includes(date) ? date : "all";
  const byDate = activeDate === "all" ? shifts : shifts.filter((s) => s.date === activeDate);
  const byRole = role === "all" ? shifts : shifts.filter((s) => s.role === role);
  const visible = byDate.filter((s) => role === "all" || s.role === role).toSorted((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const filtered = activeDate !== "all" || role !== "all";
  const clearFilters = () => {
    setDate("all");
    setRole("all");
  };
  const retry = () => void Promise.all([matchable.refetch(), open.refetch(), credentials.refetch()]);

  // One click claims (spec: the test ID sits "on the element that performs the action"). Claiming is reversible
  // from My shifts, and the toast confirms the outcome, so no confirm step. The backend decides eligibility.
  const claimingId = claim.isPending ? claim.variables?.id : undefined;
  const startClaim = (shift: Shift) => {
    setDetails(null);
    claim.mutate(shift);
  };

  return (
    <>
      <AppBar title="Available shifts">
        <UserAvatar />
      </AppBar>
      <div className="body nurse-stack">
        <OfflineBanner />
        {loading ? (
          <ListSkeleton rows={3} />
        ) : failed ? (
          <ErrorState title="Couldn't load shifts" message={(matchable.error ?? open.error)?.message ?? "Try again."} onRetry={retry} />
        ) : (
          <>
            {notice && <LicenseNotice kind={notice} />}
            {shifts.length > 0 && (
              <div className="nurse-filters">
                <ChipGroup
                  label="Date"
                  value={activeDate}
                  onChange={setDate}
                  options={[
                    { value: "all", label: "All dates", count: byRole.length },
                    ...dates.map((d) => ({ value: d, label: chipDate.format(parseIsoDate(d)), count: byRole.filter((s) => s.date === d).length })),
                  ]}
                />
                <ChipGroup<RoleFilter>
                  label="Role"
                  value={role}
                  onChange={setRole}
                  options={[
                    { value: "all", label: "All roles", count: byDate.length },
                    ...ROLES.map((r) => ({ value: r, label: r, count: byDate.filter((s) => s.role === r).length })),
                  ]}
                />
                {filtered && (
                  <button type="button" className="btn btn-ghost nurse-clear" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </div>
            )}
            {visible.length > 0 ? (
              <section aria-labelledby="nurse-list-h">
                <h2 id="nurse-list-h" className="nurse-list-h tnum">
                  {notice ? plural(visible.length, "open shift", "open shifts") : `${plural(visible.length, "shift", "shifts")} you can take`}
                </h2>
                <ul className="card-grid">
                  {visible.map((shift) => (
                    <li key={shift.id}>
                      <ShiftCard
                        shift={shift}
                        testId="shift-list-item"
                        actions={
                          <>
                            <button
                              type="button"
                              className="btn btn-primary nurse-grow"
                              data-testid="shift-claim-button"
                              disabled={!online || claim.isPending}
                              aria-busy={claimingId === shift.id}
                              aria-label={`Claim shift: ${shift.agencyName}, ${shift.role}`}
                              onClick={() => startClaim(shift)}
                            >
                              {claimingId === shift.id && <span className="spin" aria-hidden="true" />}
                              Claim shift
                            </button>
                            <button type="button" className="btn btn-secondary" aria-label={`Details: ${shift.agencyName}, ${shift.role}`} onClick={() => setDetails(shift)}>
                              Details
                            </button>
                          </>
                        }
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ) : filtered ? (
              <EmptyState
                icon="inbox"
                title="No open shifts match"
                action={
                  <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                    Clear filters
                  </button>
                }
              >
                Try another date or role. New shifts appear here as soon as agencies post them.
              </EmptyState>
            ) : (
              <EmptyState icon="inbox" title="No open shifts right now">
                New shifts appear here as soon as agencies post them.
              </EmptyState>
            )}
          </>
        )}
      </div>

      <ShiftDetailsDialog
        shift={details}
        onClose={() => setDetails(null)}
        footer={
          details && (
            <button type="button" className="btn btn-primary" disabled={!online || claim.isPending} onClick={() => startClaim(details)}>
              Claim shift
            </button>
          )
        }
      />
    </>
  );
}
