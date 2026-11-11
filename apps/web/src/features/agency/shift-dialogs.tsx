"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import { useId, useState } from "react";
import type { CancelShiftRequest, CoverageRow } from "@shiftpatch/contracts";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DetailList } from "@/components/ui/DetailList";
import { Button } from "@/components/shadcn/button";
import { AppDialog } from "@/components/ui/AppDialog";
import { Icon } from "@/components/ui/Icon";
import { NurseDetailDialog } from "@/components/ui/NurseDetailDialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate, formatShiftWhen, isOvernight, formatHours } from "@/lib/format";
import { useShiftNurse } from "@/lib/shift-nurse";
import { useCancelShift, useWithdrawShift } from "./queries";

type Reason = CancelShiftRequest["reason"];

const REASONS: { value: Reason; label: string; help: string }[] = [
  { value: "no-show", label: "No-show", help: "The nurse did not arrive. This is recorded on their history." },
  { value: "advance", label: "Cancelled in advance", help: "The agency is cancelling ahead of time. The nurse is notified." },
];

/** "RN · Fri, Oct 2 · 19:00 → Sat 07:00" */
export const shiftSummary = (s: Pick<CoverageRow, "role" | "date" | "startTime" | "endTime">) => `${s.role} · ${formatShiftWhen(s)}`;

export function WithdrawDialog({ shift, onClose }: { shift: CoverageRow | null; onClose: () => void }) {
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
export function CancelDialog({ shift, onClose }: { shift: CoverageRow | null; onClose: () => void }) {
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
    <AppDialog
      open={!!shift}
      onClose={close}
      size="md"
      blockClose={pending}
      title="Cancel this filled shift?"
      description={shift ? `${shiftSummary(shift)} · Filled by ${shift.claimedByName ?? "the nurse"}. The shift reopens for other nurses.` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>
            Keep shift
          </Button>
          <Button type="submit" form={formId} variant="destructive" loading={pending}>
            Cancel shift
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
    </AppDialog>
  );
}

/** Every field of one shift + the actions its status allows. */
export function ShiftDetailsDialog({
  shift,
  canWrite,
  onClose,
  onWithdraw,
  onCancel,
  onViewNurse,
}: {
  shift: CoverageRow | null;
  canWrite: boolean;
  onViewNurse: (s: CoverageRow) => void;
  onClose: () => void;
  onWithdraw: (s: CoverageRow) => void;
  onCancel: (s: CoverageRow) => void;
}) {
  const showActions = !!shift && canWrite && (shift.status === "open" || shift.status === "filled");
  return (
    <AppDialog
      open={!!shift}
      onClose={onClose}
      size="md"
      title={shift ? `${shift.role} shift` : "Shift"}
      description={shift ? formatShiftWhen(shift) : undefined}
      footer={
        showActions && shift ? (
          shift.status === "open" ? (
            <Button variant="danger" onClick={() => onWithdraw(shift)}>
              Withdraw shift
            </Button>
          ) : (
            <Button variant="danger" onClick={() => onCancel(shift)}>
              Cancel shift
            </Button>
          )
        ) : undefined
      }
    >
      {shift && (
        <DetailList
          items={[
            { label: "Status", value: <StatusBadge status={shift.status} /> },
            { label: "Role", value: <span className="role">{shift.role}</span> },
            { label: "Date", value: formatDate(shift.date) },
            { label: "Time", value: `${shift.startTime} → ${shift.endTime} · ${formatHours(shift)}${isOvernight(shift) ? " · Overnight" : ""}` },
            { label: "Agency", value: shift.agencyName },
            {
              label: "Claimed by",
              value: shift.claimedByName ? (
                <span className="ag-claimant">
                  {shift.claimedByName}
                  {canWrite && (
                    <Button variant="secondary" size="sm" onClick={() => onViewNurse(shift)}>
                      <Icon name="user" />
                      View nurse details
                    </Button>
                  )}
                </span>
              ) : (
                <span className="muted">Not claimed yet</span>
              ),
            },
          ]}
        />
      )}
    </AppDialog>
  );
}

/** Fetches the claiming nurse when opened (owner/manager only: the caller never offers this to viewers). */
export function ShiftNurseDialog({ shift, onClose }: { shift: CoverageRow | null; onClose: () => void }) {
  const q = useShiftNurse(shift?.id ?? null);
  return (
    <NurseDetailDialog
      open={!!shift}
      onClose={onClose}
      loading={q.isPending && !!shift}
      error={q.isError ? q.error.message : undefined}
      onRetry={() => void q.refetch()}
      nurse={q.data}
    />
  );
}
