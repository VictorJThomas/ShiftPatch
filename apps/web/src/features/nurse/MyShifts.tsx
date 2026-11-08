"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import Link from "next/link";
import { useState } from "react";
import type { Shift } from "@shiftpatch/contracts";
import { AppBar, UserAvatar } from "@/components/shells/NurseShell";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { OfflineBanner, useOnline } from "@/components/ui/OfflineBanner";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { useCancelShift, useMyShifts } from "./queries";
import { ShiftCard, ShiftDetailsDialog, ShiftSummary } from "./ShiftCard";

const byStart = (a: Shift, b: Shift) => (a.date + a.startTime).localeCompare(b.date + b.startTime);

export function MyShifts() {
  const mine = useMyShifts();
  const cancel = useCancelShift();
  const online = useOnline();
  const [details, setDetails] = useState<Shift | null>(null);
  const [cancelling, setCancelling] = useState<Shift | null>(null);

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
              <h2 id="my-upcoming-h" className="nurse-list-h tnum">
                Upcoming · {upcoming.length}
              </h2>
              {upcoming.length > 0 ? (
                <ul className="card-grid">
                  {upcoming.map((shift) => (
                    <li key={shift.id}>
                      <ShiftCard
                        shift={shift}
                        badge={
                          <span className="badge b-filled">
                            <Icon name="check-circle" />
                            Filled · you
                          </span>
                        }
                        actions={
                          <>
                            <button
                              type="button"
                              className="btn btn-danger nurse-grow"
                              data-testid="shift-cancel-button"
                              disabled={!online}
                              aria-label={`Cancel shift: ${shift.agencyName}, ${shift.role}`}
                              onClick={() => setCancelling(shift)}
                            >
                              Cancel shift
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
              ) : (
                <EmptyState
                  icon="list"
                  title="No upcoming shifts"
                  action={
                    <Link href="/nurse/shifts" className="btn btn-primary">
                      Find shifts
                    </Link>
                  }
                >
                  Shifts you claim will show up here.
                </EmptyState>
              )}
            </section>
            {completed.length > 0 && (
              <section aria-labelledby="my-completed-h">
                <h2 id="my-completed-h" className="nurse-list-h tnum">
                  Completed · {completed.length}
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
      <ConfirmDialog
        open={!!cancelling}
        tone="danger"
        title="Cancel this shift?"
        confirmLabel="Yes, cancel shift"
        cancelLabel="Keep shift"
        confirmTestId="shift-cancel-confirm-button"
        pending={cancel.isPending}
        onClose={() => setCancelling(null)}
        onConfirm={() => cancelling && cancel.mutate(cancelling, { onSettled: () => setCancelling(null) })}
      >
        {cancelling && (
          <>
            <ShiftSummary shift={cancelling} />
            <div className="alert al-info nurse-confirm-note">
              <Icon name="info" size="lg" />
              <div>
                <b>Advance cancellation</b> {cancelling.agencyName} will be notified right away, and the shift reopens for other nurses.
              </div>
            </div>
          </>
        )}
      </ConfirmDialog>
    </>
  );
}
