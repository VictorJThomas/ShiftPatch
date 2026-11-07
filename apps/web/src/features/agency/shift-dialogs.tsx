"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import { useId, useState } from "react";
import type { CancelShiftRequest, Shift } from "@shiftpatch/contracts";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate, formatShiftWhen, isOvernight, shiftHours } from "@/lib/format";
import { useCancelShift, useWithdrawShift } from "./queries";

type Reason = CancelShiftRequest["reason"];

const REASONS: { value: Reason; label: string; help: string }[] = [
  { value: "no-show", label: "No-show", help: "The nurse did not arrive. This is recorded on their history." },
  { value: "advance", label: "Cancelled in advance", help: "The agency is cancelling ahead of time. The nurse is notified." },
];

/** "RN · Fri, Oct 2 · 19:00 → Sat 07:00" */
export const shiftSummary = (s: Shift) => `${s.role} · ${formatShiftWhen(s)}`;

export function WithdrawDialog({ shift, onClose }: { shift: Shift | null; onClose: () => void }) {
  const withdraw = useWithdrawShift();
  return (
    <ConfirmDialog
      open={!!shift}
      onClose={onClose}
      title="Withdraw this shift?"
      confirmLabel="Withdraw shift"
      cancelLabel="Keep open"
      tone="danger"
      pending={withdraw.isPending}
      onConfirm={() => shift && withdraw.mutate(shift.id, { onSuccess: onClose })}
    >
      {shift && (
        <p>
          <b>{shiftSummary(shift)}</b>. It will be marked Cancelled and disappear from nurses&apos; lists.
        </p>
      )}
    </ConfirmDialog>
  );
}

/** Filled shift → reopened. The agency picks the reason; the API records it and emails the nurse. */
export function CancelDialog({ shift, onClose }: { shift: Shift | null; onClose: () => void }) {
  const cancel = useCancelShift();
  const [reason, setReason] = useState<Reason | null>(null);
  const [missing, setMissing] = useState(false);
  const formId = useId();
  const pending = cancel.isPending;

  const close = () => {
    if (pending) return;
    setReason(null);
    setMissing(false);
    onClose();
  };

  const submit = () => {
    if (!shift) return;
    if (!reason) {
      setMissing(true);
      return;
    }
    cancel.mutate({ id: shift.id, reason }, { onSuccess: close });
  };

  return (
    <Dialog
      open={!!shift}
      onClose={close}
      variant="sheet"
      title="Cancel this filled shift?"
      description={shift ? `${shiftSummary(shift)} · Filled by nurse ${shift.claimedBy ?? "—"}. The shift reopens for other nurses.` : undefined}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={close} disabled={pending}>
            Keep shift
          </button>
          <button type="submit" form={formId} className="btn btn-danger-solid" disabled={pending} aria-busy={pending || undefined}>
            {pending && <span className="spin" aria-hidden="true" />}
            Cancel shift
          </button>
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
        <fieldset className="ag-fieldset" aria-describedby={missing ? `${formId}-err` : undefined}>
          <legend className="lbl">Reason</legend>
          <div className="col" style={{ gap: 10 }}>
            {REASONS.map((r) => (
              <label key={r.value} className="ag-opt-radio">
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => {
                    setReason(r.value);
                    setMissing(false);
                  }}
                />
                <span>
                  <b>{r.label}</b>
                  <span className="ag-opt-help">{r.help}</span>
                </span>
              </label>
            ))}
          </div>
          {missing && (
            <p id={`${formId}-err`} className="errmsg" role="alert">
              <Icon name="alert-circle" size="sm" />
              Pick a reason
            </p>
          )}
        </fieldset>
      </form>
    </Dialog>
  );
}

/** Every field of one shift + the actions its status allows. */
export function ShiftDetailsDialog({
  shift,
  canWrite,
  onClose,
  onWithdraw,
  onCancel,
}: {
  shift: Shift | null;
  canWrite: boolean;
  onClose: () => void;
  onWithdraw: (s: Shift) => void;
  onCancel: (s: Shift) => void;
}) {
  const showActions = !!shift && canWrite && (shift.status === "open" || shift.status === "filled");
  return (
    <Dialog
      open={!!shift}
      onClose={onClose}
      variant="sheet"
      title={shift ? `${shift.role} shift` : "Shift"}
      description={shift ? formatShiftWhen(shift) : undefined}
      footer={
        showActions && shift ? (
          shift.status === "open" ? (
            <button type="button" className="btn btn-danger" onClick={() => onWithdraw(shift)}>
              Withdraw shift
            </button>
          ) : (
            <button type="button" className="btn btn-danger" onClick={() => onCancel(shift)}>
              Cancel shift
            </button>
          )
        ) : undefined
      }
    >
      {shift && (
        <dl className="ag-dl">
          <dt>Status</dt>
          <dd>
            <StatusBadge status={shift.status} />
          </dd>
          <dt>Shift ID</dt>
          <dd className="tnum">{shift.id}</dd>
          <dt>Role</dt>
          <dd>
            <span className="role">{shift.role}</span>
          </dd>
          <dt>Date</dt>
          <dd>{formatDate(shift.date)}</dd>
          <dt>Time</dt>
          <dd className="tnum">
            {shift.startTime} → {shift.endTime} · {shiftHours(shift)} h{isOvernight(shift) ? " · Overnight" : ""}
          </dd>
          <dt>Agency</dt>
          <dd>{shift.agencyName}</dd>
          <dt>Claimed by (Nurse ID)</dt>
          <dd className="tnum">{shift.claimedBy ?? "—"}</dd>
        </dl>
      )}
    </Dialog>
  );
}
