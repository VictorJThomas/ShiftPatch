"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import Link from "next/link";
import { useState } from "react";
import type { Shift } from "@shiftpatch/contracts";
import { Alert } from "@/components/shadcn/alert";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { AppBar, UserAvatar } from "@/components/shells/NurseShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { OfflineBanner, useOnline } from "@/components/ui/OfflineBanner";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { useMyTimesheets } from "@/features/timesheets/queries";
import { useCancelShift, useMyShifts } from "./queries";
import { ShiftCard, ShiftDetailsDialog } from "./ShiftCard";
import { SubmitHoursButton, TimesheetChip, TimesheetDialog } from "./TimesheetDialog";

const byStart = (a: Shift, b: Shift) => (a.date + a.startTime).localeCompare(b.date + b.startTime);

export function MyShifts() {
  const mine = useMyShifts();
  const cancel = useCancelShift();
  const online = useOnline();
  const [details, setDetails] = useState<Shift | null>(null);
  const [hoursFor, setHoursFor] = useState<Shift | null>(null);
  const timesheets = useMyTimesheets();
  const timesheetOf = (shift: Shift) => timesheets.data?.find((t) => t.shiftId === shift.id);
  // One click cancels (spec: the test ID is on the element that performs the action); the note above explains the effect.
  const cancellingId = cancel.isPending ? cancel.variables?.id : undefined;

  const shifts = mine.data ?? [];
  const upcoming = shifts.filter((s) => s.status === "filled").toSorted(byStart);
  const completed = shifts.filter((s) => s.status === "completed").toSorted((a, b) => byStart(b, a));

  return (
    <>
      <AppBar title="My shifts">
        <UserAvatar />
      </AppBar>
      <div className="body nurse-stack">
        <OfflineBanner />
        {mine.isPending ? (
          <ListSkeleton rows={2} />
        ) : mine.isError ? (
          <ErrorState title="Couldn't load your shifts" message={mine.error.message} onRetry={() => void mine.refetch()} />
        ) : (
          <>
            <section aria-labelledby="my-upcoming-h">
              <h2 id="my-upcoming-h" className="nurse-list-h">
                Upcoming <span className="nurse-count tnum">{upcoming.length}</span>
              </h2>
              {/* Policy notice: its own block above the cards grid, not a line inside it. */}
              {upcoming.length > 0 && (
                <Alert id="my-cancel-note" variant="info" className="nurse-policy">
                  <Icon name="info" size="lg" />
                  <div>
                    <b>Cancellation policy</b> Cancelling is an advance cancellation: the agency is notified right away and the shift reopens for other nurses.
                  </div>
                </Alert>
              )}
              {upcoming.length > 0 ? (
                <ul className="card-grid">
                  {upcoming.map((shift) => (
                    <li key={shift.id}>
                      <ShiftCard
                        shift={shift}
                        badge={
                          <>
                            <Badge variant="filled">
                              <Icon name="check-circle" />
                              Claimed by you
                            </Badge>
                            <TimesheetChip timesheet={timesheetOf(shift)} />
                          </>
                        }
                        actions={
                          <>
                            <SubmitHoursButton shift={shift} timesheet={timesheetOf(shift)} disabled={!online} onOpen={setHoursFor} />
                            <Button
                              variant="danger"
                              className="min-h-12 min-w-0 flex-1"
                              data-testid="shift-cancel-button"
                              disabled={!online || cancel.isPending}
                              loading={cancellingId === shift.id}
                              aria-describedby="my-cancel-note"
                              aria-label={`Cancel shift: ${shift.agencyName}, ${shift.role}`}
                              onClick={() => cancel.mutate(shift)}
                            >
                              Cancel shift
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
              ) : (
                <EmptyState
                  icon="list"
                  title="No upcoming shifts"
                  action={
                    <Button asChild>
                      <Link href="/nurse/shifts">Find shifts</Link>
                    </Button>
                  }
                >
                  Shifts you claim will show up here.
                </EmptyState>
              )}
            </section>
            {completed.length > 0 && (
              <section aria-labelledby="my-completed-h">
                <h2 id="my-completed-h" className="nurse-list-h">
                  Completed <span className="nurse-count tnum">{completed.length}</span>
                </h2>
                <ul className="card-grid">
                  {completed.map((shift) => (
                    <li key={shift.id}>
                      <ShiftCard shift={shift} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      <ShiftDetailsDialog shift={details} onClose={() => setDetails(null)} />
      <TimesheetDialog shift={hoursFor} timesheet={hoursFor ? timesheetOf(hoursFor) : undefined} onClose={() => setHoursFor(null)} />
    </>
  );
}
