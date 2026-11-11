"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import { useId, useState } from "react";
import { NOTE_MAX, SubmitTimesheetRequest, workedMinutes, type Shift, type TimesheetRow } from "@shiftpatch/contracts";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { AppDialog } from "@/components/ui/AppDialog";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { formatHours, formatShiftWhen } from "@/lib/format";
import { formatWorked, hasStarted } from "@/features/timesheets/format";
import { TimesheetStatusBadge } from "@/features/timesheets/TimesheetList";
import { useSubmitTimesheet } from "@/features/timesheets/queries";

/** Submit is offered on a started shift that has no timesheet yet, or whose timesheet was disputed (resubmit). */
export const canSubmitHours = (shift: Shift, timesheet: TimesheetRow | undefined, now?: Date) =>
  shift.status === "filled" && hasStarted(shift, now) && (!timesheet || timesheet.status === "disputed");

/** Status chip for a shift's timesheet (Submitted / Approved / Disputed) with the agency's reason when disputed. Null when there is none. */
export function TimesheetChip({ timesheet }: { timesheet: TimesheetRow | undefined }) {
  if (!timesheet) return null;
  return (
    <>
      <TimesheetStatusBadge status={timesheet.status} />
      {timesheet.status === "disputed" && timesheet.reviewNote && (
        <p className="muted" style={{ flexBasis: "100%", margin: 0 }}>
          <b>Reason:</b> {timesheet.reviewNote}
        </p>
      )}
    </>
  );
}

/** "Submit hours" / "Resubmit hours" button, or null when the shift does not qualify. */
export function SubmitHoursButton({ shift, timesheet, disabled, onOpen }: { shift: Shift; timesheet: TimesheetRow | undefined; disabled?: boolean; onOpen: (s: Shift) => void }) {
  if (!canSubmitHours(shift, timesheet)) return null;
  const label = timesheet ? "Resubmit hours" : "Submit hours";
  return (
    <Button className="min-h-12 min-w-0 flex-1" disabled={disabled} aria-label={`${label}: ${shift.agencyName}, ${shift.role}`} onClick={() => onOpen(shift)}>
      {label}
    </Button>
  );
}

type FieldName = "clockIn" | "clockOut" | "breakMinutes" | "note";

/** Dialog to submit (or resubmit) hours for one shift. Times are facility-local HH:MM; clocking out at or before clock-in means the next day. */
export function TimesheetDialog({ shift, timesheet, onClose }: { shift: Shift | null; timesheet: TimesheetRow | undefined; onClose: () => void }) {
  const [nonce, setNonce] = useState(0); // a fresh form per open
  return (
    <TimesheetDialogBody
      key={`${shift?.id ?? "none"}-${nonce}`}
      shift={shift}
      timesheet={timesheet}
      onClose={() => {
        setNonce((n) => n + 1);
        onClose();
      }}
    />
  );
}

function TimesheetDialogBody({ shift, timesheet, onClose }: { shift: Shift | null; timesheet: TimesheetRow | undefined; onClose: () => void }) {
  const submit = useSubmitTimesheet();
  const formId = useId();
  // Always start from the scheduled times (also on resubmit), so the nurse sees the shift's hours; she can still enter any range.
  const [clockIn, setClockIn] = useState(shift?.startTime ?? "");
  const [clockOut, setClockOut] = useState(shift?.endTime ?? "");
  const [breakText, setBreakText] = useState(String(timesheet?.breakMinutes ?? 0));
  const [note, setNote] = useState(timesheet?.note ?? "");
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const pending = submit.isPending;

  const parsed = SubmitTimesheetRequest.safeParse({ clockIn, clockOut, breakMinutes: breakText.trim() === "" ? 0 : Number(breakText), ...(note.trim() ? { note } : {}) });
  const worked = parsed.success ? workedMinutes(parsed.data.clockIn, parsed.data.clockOut, parsed.data.breakMinutes) : null;

  const close = () => {
    if (!pending) onClose();
  };
  const onSubmit = () => {
    if (!shift) return;
    if (!parsed.success) {
      const next: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) next[(issue.path[0] as FieldName | undefined) ?? "clockOut"] ??= issue.message;
      return setErrors(next);
    }
    submit.mutate({ shiftId: shift.id, body: parsed.data }, { onSuccess: onClose });
  };
  const clear = (f: FieldName) => setErrors((e) => ({ ...e, [f]: undefined }));
  const resubmit = timesheet?.status === "disputed";

  return (
    <AppDialog
      open={!!shift}
      onClose={close}
      size="md"
      blockClose={pending}
      title={resubmit ? "Resubmit your hours" : "Submit your hours"}
      description={shift ? `${shift.agencyName} · ${shift.role} · ${formatShiftWhen(shift)}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={pending}>
            {resubmit ? "Resubmit hours" : "Submit hours"}
          </Button>
        </>
      }
    >
      {resubmit && timesheet?.reviewNote && (
        <p className="alert al-warn" role="status">
          <Icon name="alert" />
          <span>
            <b>The agency disputed these hours:</b> {timesheet.reviewNote}
            <br />
            You submitted {timesheet.clockIn} → {timesheet.clockOut}, {timesheet.breakMinutes} min break.
          </span>
        </p>
      )}
      <form
        id={formId}
        noValidate
        aria-busy={pending || undefined}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {shift && (
          <p className="muted tnum" style={{ margin: "0 0 12px" }}>
            Scheduled: {shift.startTime} → {shift.endTime} · {formatHours(shift)}. Change the times if you worked a different range.
          </p>
        )}
        <div className="ag-two">
          <Field label="Clock in" error={errors.clockIn} required>
            {(p) => <Input {...p} type="time" step={60} value={clockIn} onChange={(e) => { setClockIn(e.target.value); clear("clockIn"); clear("clockOut"); }} />}
          </Field>
          <Field label="Clock out" error={errors.clockOut} required>
            {(p) => <Input {...p} type="time" step={60} value={clockOut} onChange={(e) => { setClockOut(e.target.value); clear("clockOut"); }} />}
          </Field>
        </div>
        <Field label="Unpaid break (minutes)" error={errors.breakMinutes} hint="0 to 240.">
          {(p) => <Input {...p} type="number" inputMode="numeric" min={0} max={240} step={1} value={breakText} onChange={(e) => { setBreakText(e.target.value); clear("breakMinutes"); clear("clockOut"); }} />}
        </Field>
        <Field label="Note (optional)" error={errors.note} hint={`For the agency. ${NOTE_MAX} characters at most.`}>
          {(p) => <Textarea {...p} value={note} onChange={(e) => { setNote(e.target.value); clear("note"); }} />}
        </Field>
        <div className="ag-preview" aria-live="polite">
          <Icon name="clock" />
          {worked !== null ? <span className="tnum">Worked: {formatWorked(worked)}</span> : <span className="muted">Enter clock in and out to see the worked time.</span>}
        </div>
        <p className="alert al-info ag-note">
          <Icon name="info" />
          <span>Facility-local time, 24-hour. Clocking out earlier than you clocked in means the next day.</span>
        </p>
      </form>
    </AppDialog>
  );
}
