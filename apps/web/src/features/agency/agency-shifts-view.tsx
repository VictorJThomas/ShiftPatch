"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import { useMemo, useState, useSyncExternalStore } from "react";
import type { Shift } from "@shiftpatch/contracts";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatShiftWhen, isOvernight, parseIsoDate, shiftHours } from "@/lib/format";
import { PostShiftDialog } from "./post-shift-form";
import { useActiveMembership, useAgencyShifts } from "./queries";
import { CancelDialog, ShiftDetailsDialog, WithdrawDialog, shiftSummary } from "./shift-dialogs";

type Filter = "all" | Shift["status"];
type Sort = "asc" | "desc";

const DESKTOP = "(min-width: 720px)";
const subscribeDesktop = (onChange: () => void) => {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
/**
 * One layout in the DOM at a time (table ≥720, cards below), so each test ID / action exists once per shift.
 * No matchMedia (jsdom, SSR) = desktop.
 */
function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribeDesktop, () => !window.matchMedia || window.matchMedia(DESKTOP).matches, () => true);
}

const sortKey = (s: Shift) => `${s.date}T${s.startTime}`;

/** Open shifts starting today .. today+7 (facility-local dates, compared as local calendar days). */
function openNextWeek(shifts: Shift[], now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const limit = today + 7 * 86_400_000;
  return shifts.filter((s) => {
    if (s.status !== "open") return false;
    const t = parseIsoDate(s.date).getTime();
    return t >= today && t <= limit;
  }).length;
}

/** Agency home. Keyed by agency id by the page, so switching agency resets filters and closes every dialog. */
export function AgencyShiftsView() {
  const { membership, canWrite } = useActiveMembership();
  const q = useAgencyShifts();
  const desktop = useIsDesktop();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("asc");
  const [posting, setPosting] = useState(false);
  const [details, setDetails] = useState<Shift | null>(null);
  const [withdrawing, setWithdrawing] = useState<Shift | null>(null);
  const [cancelling, setCancelling] = useState<Shift | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const shifts = useMemo(() => q.data?.shifts ?? [], [q.data]);
  const counts = useMemo(() => {
    const c = { all: shifts.length, open: 0, filled: 0, cancelled: 0, completed: 0 };
    for (const s of shifts) c[s.status]++;
    return c;
  }, [shifts]);
  const visible = useMemo(() => {
    const list = filter === "all" ? shifts : shifts.filter((s) => s.status === filter);
    return [...list].sort((a, b) => (sort === "asc" ? 1 : -1) * sortKey(a).localeCompare(sortKey(b)));
  }, [shifts, filter, sort]);

  const agencyName = membership?.name ?? "this agency";
  const viewerNote = "View-only access: owners and managers can post and change shifts.";

  const postButton = (
    <button
      type="button"
      className="btn btn-primary"
      data-testid="agency-post-shift-button"
      onClick={() => setPosting(true)}
      disabled={!canWrite}
      aria-describedby={canWrite ? undefined : "ag-viewer-note"}
    >
      <Icon name="plus" />
      Post shift
    </button>
  );

  const actions = {
    canWrite,
    onDetails: setDetails,
    onWithdraw: setWithdrawing,
    onCancel: setCancelling,
  };

  const filterOptions: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "open", label: "Open", count: counts.open },
    { value: "filled", label: "Filled", count: counts.filled },
    { value: "cancelled", label: "Cancelled", count: counts.cancelled },
  ];
  if (counts.completed > 0) filterOptions.push({ value: "completed", label: "Completed", count: counts.completed });

  return (
    <>
      <PageHeader
        title="Shifts"
        description={
          <>
            {q.data && (
              <>
                <span data-testid="agency-shift-count">
                  {counts.all} {counts.all === 1 ? "shift" : "shifts"}
                </span>
                {" · "}
              </>
            )}
            Facility-local time, 24-hour.
          </>
        }
        actions={postButton}
      />
      {!canWrite && membership && (
        <p id="ag-viewer-note" className="alert al-info ag-note">
          <Icon name="lock" />
          <span>{viewerNote}</span>
        </p>
      )}
      <OfflineBanner />

      {q.isPending ? (
        <ListSkeleton variant={desktop ? "table" : "card"} rows={3} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load shifts" message={q.error.message} onRetry={() => void q.refetch()} />
      ) : shifts.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="No shifts posted yet"
          action={
            canWrite ? (
              <button type="button" className="btn btn-primary" onClick={() => setPosting(true)}>
                <Icon name="plus" />
                Post shift
              </button>
            ) : undefined
          }
        >
          {canWrite ? "Post your first shift and nurses will see it right away." : "Shifts this agency posts will appear here."}
        </EmptyState>
      ) : (
        <>
          <section aria-label="Summary" className="ag-stats">
            <Stat label="Open" value={counts.open} icon="dot" tone="open" />
            <Stat label="Filled" value={counts.filled} icon="check-circle" tone="filled" />
            <Stat label="Cancelled" value={counts.cancelled} icon="ban" tone="cancelled" />
            <Stat label="Open in next 7 days" value={openNextWeek(shifts)} icon="cal" />
          </section>
          <div className="ag-toolbar">
            <ChipGroup label="Filter by status" value={filter} onChange={setFilter} options={filterOptions} />
            {!desktop && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSort((s) => (s === "asc" ? "desc" : "asc"))}>
                <Icon name="cal" />
                {sort === "asc" ? "Soonest first" : "Latest first"}
              </button>
            )}
          </div>
          {visible.length === 0 ? (
            <EmptyState
              icon="search"
              title={`No ${filter} shifts`}
              action={
                <button type="button" className="btn btn-secondary" onClick={() => setFilter("all")}>
                  Clear filter
                </button>
              }
            >
              Nothing matches this filter for {agencyName}.
            </EmptyState>
          ) : desktop ? (
            <ShiftTable shifts={visible} sort={sort} onSort={() => setSort((s) => (s === "asc" ? "desc" : "asc"))} highlight={highlight} agencyName={agencyName} {...actions} />
          ) : (
            <ShiftCards shifts={visible} highlight={highlight} {...actions} />
          )}
        </>
      )}

      <PostShiftDialog
        open={posting}
        agencyName={agencyName}
        onClose={() => setPosting(false)}
        onPosted={(shift) => {
          setPosting(false);
          setFilter("all");
          setHighlight(shift.id);
        }}
      />
      <ShiftDetailsDialog
        shift={details}
        canWrite={canWrite}
        onClose={() => setDetails(null)}
        onWithdraw={(s) => {
          setDetails(null);
          setWithdrawing(s);
        }}
        onCancel={(s) => {
          setDetails(null);
          setCancelling(s);
        }}
      />
      <WithdrawDialog shift={withdrawing} onClose={() => setWithdrawing(null)} />
      <CancelDialog shift={cancelling} onClose={() => setCancelling(null)} />
    </>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: "dot" | "check-circle" | "ban" | "cal"; tone?: "open" | "filled" | "cancelled" }) {
  return (
    <div className="card stat">
      <span className="l">
        <span className={tone ? `ag-stat-ic ag-tone-${tone}` : "ag-stat-ic"}>
          <Icon name={icon} />
        </span>
        {label}
      </span>
      <span className="n">{value}</span>
    </div>
  );
}

interface RowActions {
  canWrite: boolean;
  onDetails: (s: Shift) => void;
  onWithdraw: (s: Shift) => void;
  onCancel: (s: Shift) => void;
}

/** Withdraw (open) / Cancel (filled) / nothing. The cancel button carries the spec's `shift-cancel-button`. */
function RowAction({ shift, canWrite, onWithdraw, onCancel, block }: RowActions & { shift: Shift; block?: boolean }) {
  const label = shiftSummary(shift);
  const cls = `btn btn-danger btn-sm${block ? " ag-card-btn" : ""}`;
  if (!canWrite || (shift.status !== "open" && shift.status !== "filled")) return <span className="muted">—</span>;
  return shift.status === "open" ? (
    <button type="button" className={cls} onClick={() => onWithdraw(shift)} aria-label={`Withdraw, ${label}`}>
      Withdraw
    </button>
  ) : (
    <button type="button" className={cls} onClick={() => onCancel(shift)} aria-label={`Cancel shift, ${label}`} data-testid="shift-cancel-button">
      Cancel shift
    </button>
  );
}

function When({ shift }: { shift: Shift }) {
  return (
    <span className="ag-when">
      <span className="tnum">{formatShiftWhen(shift)}</span>
      <span className="ag-when-meta">
        {isOvernight(shift) && (
          <span className="tag">
            <Icon name="moon" />
            Overnight
          </span>
        )}
        <span className="muted tnum">{shiftHours(shift)} h</span>
      </span>
    </span>
  );
}

function ShiftTable({
  shifts,
  sort,
  onSort,
  highlight,
  agencyName,
  ...actions
}: RowActions & { shifts: Shift[]; sort: Sort; onSort: () => void; highlight: string | null; agencyName: string }) {
  return (
    <div className="card scrollx">
      <table className="tbl ag-tbl">
        <caption className="sr">Shifts posted by {agencyName}</caption>
        <thead>
          <tr>
            <th scope="col">Shift</th>
            <th scope="col" aria-sort={sort === "asc" ? "ascending" : "descending"}>
              <button type="button" className="ag-sort" onClick={onSort}>
                Date / time
                <Icon name="down" className={sort === "asc" ? "flip" : ""} />
                <span className="sr">, sorted {sort === "asc" ? "soonest first" : "latest first"}</span>
              </button>
            </th>
            <th scope="col">Status</th>
            <th scope="col">Claimed by</th>
            <th scope="col">
              <span className="sr">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((s) => (
            <tr key={s.id} className={s.id === highlight ? "ag-new" : undefined}>
              <th scope="row" className="ag-cell-shift">
                <span className="role">{s.role}</span>
                <button type="button" className="ag-link tnum" onClick={() => actions.onDetails(s)} aria-label={`${s.id}, details for ${shiftSummary(s)}`}>
                  {s.id}
                </button>
              </th>
              <td>
                <When shift={s} />
              </td>
              <td>
                <StatusBadge status={s.status} />
              </td>
              <td className="tnum">{s.claimedBy ? <span title="Nurse ID">{s.claimedBy}</span> : <span className="muted">—</span>}</td>
              <td className="ag-cell-act">
                <RowAction shift={s} {...actions} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShiftCards({ shifts, highlight, ...actions }: RowActions & { shifts: Shift[]; highlight: string | null }) {
  return (
    <ul className="ag-cards">
      {shifts.map((s) => (
        <li key={s.id} className={`card ag-card${s.id === highlight ? " ag-new" : ""}`}>
          <div className="row between">
            <span className="row">
              <span className="role">{s.role}</span>
              <span className="muted tnum">{s.id}</span>
            </span>
            <StatusBadge status={s.status} />
          </div>
          <When shift={s} />
          <div className="ag-card-claim">
            <span className="muted">Claimed by (Nurse ID)</span> <span className="tnum">{s.claimedBy ?? "—"}</span>
          </div>
          <div className="ag-card-actions">
            <button type="button" className="btn btn-secondary btn-sm ag-card-btn" onClick={() => actions.onDetails(s)} aria-label={`Details, ${shiftSummary(s)}`}>
              Details
            </button>
            {actions.canWrite && (s.status === "open" || s.status === "filled") && <RowAction shift={s} {...actions} block />}
          </div>
        </li>
      ))}
    </ul>
  );
}
