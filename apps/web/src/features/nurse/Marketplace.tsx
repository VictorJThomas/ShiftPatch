"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import Link from "next/link";
import { useState } from "react";
import type { Shift, ShiftRole } from "@shiftpatch/contracts";
import { Alert } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { AppBar, UserAvatar } from "@/components/shells/NurseShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { FilterGroup } from "@/components/ui/FilterBar";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { Icon } from "@/components/ui/Icon";
import { OfflineBanner, useOnline } from "@/components/ui/OfflineBanner";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { EMPTY_RANGE, effectiveRange, inDateRange, singleDay, type DateRange } from "@/lib/date-range";
import { newCredentialHref } from "./credential-upload";
import { useClaimShift, useCredentials, useFilteredShifts, useMatchableShifts, useOpenShifts, type ShiftParams } from "./queries";
import { ShiftCard, ShiftDetailsDialog } from "./ShiftCard";

type RoleFilter = "all" | ShiftRole;
const ROLES: ShiftRole[] = ["RN", "LPN", "CNA"];
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
      <Alert variant="warning" role="status" className="nurse-notice">
        <Icon name="cal-x" size="lg" />
        <div>
          <b>Your license has expired.</b> Upload a renewed license to claim shifts.
          <Link href={newCredentialHref("license")} className="nurse-notice-link">
            Upload renewed license
            <Icon name="arrow" size="sm" />
          </Link>
        </div>
      </Alert>
    );
  }
  return (
    <Alert variant="info" role="status">
      <Icon name="info" size="lg" />
      <div>
        <b>No shifts match your credentials right now</b> Here are all open shifts. Claiming checks your credentials.
      </div>
    </Alert>
  );
}

export function Marketplace() {
  // Two unfiltered queries: they pick the source (matchable first, open as the lapsed fallback) and feed the chip counts.
  const matchable = useMatchableShifts();
  const open = useOpenShifts();
  const credentials = useCredentials(); // a failure just means the neutral copy
  const claim = useClaimShift();
  const online = useOnline();

  const [dates, setDates] = useState<DateRange>(EMPTY_RANGE);
  const [role, setRole] = useState<RoleFilter>("all");
  const [details, setDetails] = useState<Shift | null>(null);

  const loading = matchable.isPending || open.isPending;
  const failed = matchable.isError || open.isError;
  const { shifts: all, notice } = loading || failed ? { shifts: [], notice: null } : pickShiftSource(matchable.data, open.data, credentials.data?.licenseValid);

  // Date range (inclusive, either end optional). The API filters one exact `date`, so a one-day range goes to the server
  // with the role; any wider range is applied here, on top of the same server-filtered (or unfiltered) list.
  // A backwards range shows an inline error and filters nothing until fixed.
  const range = effectiveRange(dates);
  const day = singleDay(range);
  const dateActive = Boolean(range.from || range.to);
  const inRange = (s: Shift) => inDateRange(s.date, range);
  const days = all.map((s) => s.date).sort(); // bounds for the pickers: the first and last day with an open shift
  const activeCount = (dateActive ? 1 : 0) + (role !== "all" ? 1 : 0);
  const filtered = activeCount > 0;
  // Role chip counts follow the date range, from the unfiltered data.
  const byDate = dateActive ? all.filter(inRange) : all;

  // Server-filtered when the role (or one exact day) is set: same params and source as before.
  const useMatch = !loading && !failed && matchable.data.length > 0;
  const params: ShiftParams = { matchable: useMatch || undefined, role: role === "all" ? undefined : role, date: day };
  const serverFiltered = role !== "all" || day !== undefined;
  const list = useFilteredShifts(params, serverFiltered && !loading && !failed);
  const listFailed = serverFiltered && list.isError;
  const listPending = serverFiltered && list.isPending;
  const visible = (serverFiltered ? (list.data ?? []) : all).filter(inRange).toSorted((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const clearFilters = () => {
    setDates(EMPTY_RANGE);
    setRole("all");
  };
  const retry = () => void Promise.all([matchable.refetch(), open.refetch(), credentials.refetch(), serverFiltered ? list.refetch() : undefined]);

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
            {all.length > 0 && (
              <div className="flex">
                {/* Immediate: every change re-filters (role and one-day ranges on the server), so no Apply step. */}
                <FilterDropdown label="Filters" activeCount={activeCount} onReset={clearFilters}>
                  <div className="flex flex-col gap-4">
                    <DateRangeFilter label="Date" value={dates} onChange={setDates} min={days[0]} max={days.at(-1)} />
                    <FilterGroup<RoleFilter>
                      label="Role"
                      value={role}
                      onChange={setRole}
                      options={[
                        { value: "all", label: "All roles", count: byDate.length },
                        ...ROLES.map((r) => ({ value: r, label: r, count: byDate.filter((s) => s.role === r).length })),
                      ]}
                    />
                  </div>
                </FilterDropdown>
              </div>
            )}
            {listFailed ? (
              <ErrorState title="Couldn't load shifts" message={list.error?.message ?? "Try again."} onRetry={retry} />
            ) : listPending ? (
              <ListSkeleton rows={3} />
            ) : visible.length > 0 ? (
              <section aria-labelledby="nurse-list-h" aria-busy={list.isPlaceholderData || undefined}>
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
                            <Button
                              className="min-h-12 min-w-0 flex-1"
                              data-testid="shift-claim-button"
                              disabled={!online || claim.isPending}
                              loading={claimingId === shift.id}
                              aria-label={`Claim shift: ${shift.agencyName}, ${shift.role}`}
                              onClick={() => startClaim(shift)}
                            >
                              Claim shift
                            </Button>
                            <Button variant="secondary" className="min-h-12" aria-label={`Details: ${shift.agencyName}, ${shift.role}`} onClick={() => setDetails(shift)}>
                              Details
                            </Button>
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
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              >
                Try other dates or another role. New shifts appear here as soon as agencies post them.
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
            <Button disabled={!online || claim.isPending} onClick={() => startClaim(details)}>
              Claim shift
            </Button>
          )
        }
      />
    </>
  );
}
