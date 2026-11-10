"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import type { ReactNode } from "react";
import type { Shift } from "@shiftpatch/contracts";
import { AppDialog } from "@/components/ui/AppDialog";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate, formatShiftWhen, isOvernight, shiftHours } from "@/lib/format";

/** "Fri, Oct 2 · 19:00 → Sat 07:00" with the arrow muted (design `.when .arr`). */
export function ShiftWhen({ shift }: { shift: Shift }) {
  const [start, end] = formatShiftWhen(shift).split(" → ");
  return (
    <>
      {start} <span className="arr">→</span> {end}
    </>
  );
}

/** "Overnight · 12 h" (moon) or "Day · 12 h" (clock). */
export function DurationTag({ shift }: { shift: Shift }) {
  const night = isOvernight(shift);
  return (
    <span className="tag">
      <Icon name={night ? "moon" : "clock"} />
      {night ? "Overnight" : "Day"} · {shiftHours(shift)} h
    </span>
  );
}

/**
 * Nurse shift card (design: Nurse-Shifts). Agency is the card's h3 (the list has an h2 above it).
 * `testId` goes on the root: `shift-list-item` only on the open-shifts list. `actions` = the button row.
 */
export function ShiftCard({ shift, testId, badge, actions }: { shift: Shift; testId?: string; badge?: ReactNode; actions?: ReactNode }) {
  return (
    <article className="card shift nurse-card" data-testid={testId}>
      <div className="row between nurse-card-top">
        <h3 className="agency">{shift.agencyName}</h3>
        <span className="role">{shift.role}</span>
      </div>
      <div className="col nurse-card-meta">
        <p className="when">
          <ShiftWhen shift={shift} />
        </p>
        <div className="row nurse-card-tags">
          <DurationTag shift={shift} />
          {badge ?? <StatusBadge status={shift.status} />}
        </div>
      </div>
      {actions && <div className="row nurse-card-actions">{actions}</div>}
    </article>
  );
}

/** Compact summary for confirm sheets (design: Nurse-Detail-Claim step 2). */
export function ShiftSummary({ shift }: { shift: Shift }) {
  return (
    <div className="nurse-summary">
      <div className="row between">
        <b>{shift.agencyName}</b>
        <span className="role">{shift.role}</span>
      </div>
      <p className="tnum nurse-summary-when">{formatShiftWhen(shift)}</p>
    </div>
  );
}

/** Full shift info in a bottom sheet. Only fields the API returns: no invented pay, facility or contact. */
export function ShiftDetailsDialog({ shift, onClose, footer }: { shift: Shift | null; onClose: () => void; footer?: ReactNode }) {
  return (
    <AppDialog open={!!shift} onClose={onClose} size="md" title={shift?.agencyName ?? "Shift details"} description={shift ? formatShiftWhen(shift) : undefined} footer={footer}>
      {shift && (
        <>
          <div className="row nurse-card-tags">
            <span className="role">{shift.role}</span>
            <DurationTag shift={shift} />
            <StatusBadge status={shift.status} />
          </div>
          <dl className="nurse-dl">
            <div>
              <Icon name="building" />
              <dt>Agency</dt>
              <dd>{shift.agencyName}</dd>
            </div>
            <div>
              <Icon name="cal" />
              <dt>Date</dt>
              <dd>{formatDate(shift.date)}</dd>
            </div>
            <div>
              <Icon name="clock" />
              <dt>Hours</dt>
              <dd className="tnum">
                {shift.startTime} → {shift.endTime}
                {isOvernight(shift) ? " (next day)" : ""} · {shiftHours(shift)} h
              </dd>
            </div>
            <div>
              <Icon name="idcard" />
              <dt>Role required</dt>
              <dd>{shift.role} license</dd>
            </div>
          </dl>
        </>
      )}
    </AppDialog>
  );
}
