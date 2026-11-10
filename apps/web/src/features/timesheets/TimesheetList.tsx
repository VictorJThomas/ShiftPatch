"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import { useId, useState } from "react";
import { DisputeTimesheetRequest, REASON_MAX, type TimesheetRow, type TimesheetStatus } from "@shiftpatch/contracts";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Textarea } from "@/components/shadcn/textarea";
import { AppDialog } from "@/components/ui/AppDialog";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ErrorState } from "@/components/ui/States";
import { formatShiftWhen } from "@/lib/format";
import { formatWorked } from "./format";
import { type StatusFilter, useApproveTimesheet, useDisputeTimesheet, useTimesheets } from "./queries";

const BADGE: Record<TimesheetStatus, { variant: "pending" | "verified" | "rejected"; icon: IconName; label: string }> = {
  submitted: { variant: "pending", icon: "clock", label: "Submitted" },
  approved: { variant: "verified", icon: "check-circle", label: "Approved" },
  disputed: { variant: "rejected", icon: "x-circle", label: "Disputed" },
};

/** Icon + label + tint, never colour alone. */
export function TimesheetStatusBadge({ status }: { status: TimesheetStatus }) {
  const b = BADGE[status];
  return (
    <Badge variant={b.variant}>
      <Icon name={b.icon} />
      {b.label}
    </Badge>
  );
}

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "disputed", label: "Disputed" },
];

const summary = (t: TimesheetRow) => `${t.nurseName} · ${t.role} · ${formatShiftWhen({ date: t.shiftDate, startTime: t.startTime, endTime: t.endTime })}`;

/** Dispute needs a reason (1..500), validated with the same contract the API uses. Stays open on a server error. */
function DisputeDialog({ timesheet, onClose }: { timesheet: TimesheetRow | null; onClose: () => void }) {
  const dispute = useDisputeTimesheet();
  const formId = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const pending = dispute.isPending;

  const close = () => {
    if (pending) return;
    setReason("");
    setError(undefined);
    onClose();
  };
  const submit = () => {
    if (!timesheet) return;
    const parsed = DisputeTimesheetRequest.safeParse({ reason });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Invalid request");
    dispute.mutate({ id: timesheet.id, body: parsed.data }, { onSuccess: close });
  };

  return (
    <AppDialog
      open={!!timesheet}
      onClose={close}
      size="md"
      blockClose={pending}
      title="Dispute these hours?"
      description={timesheet ? `${summary(timesheet)} · ${timesheet.clockIn} → ${timesheet.clockOut}, ${formatWorked(timesheet.workedMinutes)}. The nurse can correct and resubmit.` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>
            Keep as submitted
          </Button>
          <Button type="submit" form={formId} variant="destructive" loading={pending}>
            Dispute hours
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Reason" error={error} hint={`Shown to the nurse in the app. ${REASON_MAX} characters at most.`} required>
          {(p) => (
            <Textarea
              {...p}
              name="reason"
              value={reason}
              maxLength={REASON_MAX + 50}
              onChange={(e) => {
                setReason(e.target.value);
                setError(undefined);
              }}
            />
          )}
        </Field>
      </form>
    </AppDialog>
  );
}

/**
 * Timesheets table with a status filter and, for reviewers, Approve / Dispute on submitted rows. Shared by the agency page and
 * the admin view. `canReview` is a UI hint: the API checks every write (viewers get 403).
 */
export function TimesheetList({ canReview, tableTestId }: { canReview: boolean; tableTestId?: string }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const q = useTimesheets(status);
  const approve = useApproveTimesheet();
  const [disputing, setDisputing] = useState<TimesheetRow | null>(null);
  const rows = q.data ?? [];
  const approvingId = approve.isPending ? approve.variables?.id : undefined;
  const cols = canReview ? 8 : 7;

  return (
    <>
      <div className="adm-chips">
        <ChipGroup label="Filter by status" options={FILTERS} value={status} onChange={setStatus} />
      </div>
      {q.isError && !q.data && <ErrorState title="Couldn't load timesheets" message={q.error.message} onRetry={() => void q.refetch()} />}
      <div className="scrollx" aria-busy={q.isPending}>
        <table data-testid={tableTestId} className="tbl adm-tbl">
          <caption className="sr">Timesheets</caption>
          <thead>
            <tr>
              <th scope="col">Nurse</th>
              <th scope="col">Shift</th>
              <th scope="col">Clocked</th>
              <th scope="col">Break</th>
              <th scope="col">Worked</th>
              <th scope="col">Status</th>
              <th scope="col">Note</th>
              {canReview && <th scope="col">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={cols} className="empty-cell">
                  <EmptyState icon="clock" title={q.isPending ? "Loading timesheets…" : status === "all" ? "No timesheets yet" : "No timesheets with this status"}>
                    {status === "all" ? "Hours show here once nurses submit them for their filled shifts." : "Try another status."}
                  </EmptyState>
                </td>
              </tr>
            ) : (
              rows.map((t) => (
                <tr key={t.id}>
                  <td>{t.nurseName}</td>
                  <td>
                    <span className="adm-id">{t.shiftId}</span> · {t.agencyName}
                    <br />
                    <span className="muted">
                      {t.role} · {formatShiftWhen({ date: t.shiftDate, startTime: t.startTime, endTime: t.endTime })}
                    </span>
                  </td>
                  <td className="num">
                    {t.clockIn} → {t.clockOut}
                  </td>
                  <td className="num">{t.breakMinutes} min</td>
                  <td className="num">{formatWorked(t.workedMinutes)}</td>
                  <td>
                    <TimesheetStatusBadge status={t.status} />
                  </td>
                  <td>
                    {t.reviewNote ? (
                      <span>
                        <b>Reason:</b> {t.reviewNote}
                      </span>
                    ) : (
                      (t.note ?? <span className="muted">—</span>)
                    )}
                  </td>
                  {canReview && (
                    <td>
                      {t.status === "submitted" ? (
                        <div className="row" style={{ gap: 8 }}>
                          <Button size="sm" loading={approvingId === t.id} disabled={approve.isPending} aria-label={`Approve hours: ${summary(t)}`} onClick={() => approve.mutate(t)}>
                            Approve
                          </Button>
                          <Button size="sm" variant="secondary" disabled={approve.isPending} aria-label={`Dispute hours: ${summary(t)}`} onClick={() => setDisputing(t)}>
                            Dispute
                          </Button>
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <DisputeDialog timesheet={disputing} onClose={() => setDisputing(null)} />
    </>
  );
}
