"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import { useMemo, useState, useSyncExternalStore } from "react";
import type { AgencyCoverageQuery, CoverageRow } from "@shiftpatch/contracts";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterGroup } from "@/components/ui/FilterBar";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { Icon } from "@/components/ui/Icon";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { StatTile } from "@/components/ui/StatTile";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatShiftWhen, isOvernight, parseIsoDate, shiftHours } from "@/lib/format";
import { PostShiftDialog } from "./post-shift-form";
import { useActiveMembership, useAgencyCoverage } from "./queries";
import { CancelDialog, ShiftDetailsDialog, ShiftNurseDialog, WithdrawDialog, shiftSummary } from "./shift-dialogs";

type Status = "all" | CoverageRow["status"];
type Role = "all" | CoverageRow["role"];
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

const sortKey = (s: CoverageRow) => `${s.date}T${s.startTime}`;

/** Open shifts starting today .. today+7 (facility-local dates, compared as local calendar days). */
function openNextWeek(shifts: CoverageRow[], now = new Date()): number {
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
  const desktop = useIsDesktop();
  const [status, setStatus] = useState<Status>("all");
  const [role, setRole] = useState<Role>("all");
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("asc");
  const [posting, setPosting] = useState(false);
  const [details, setDetails] = useState<CoverageRow | null>(null);
  const [nurseOf, setNurseOf] = useState<CoverageRow | null>(null);
  const [withdrawing, setWithdrawing] = useState<CoverageRow | null>(null);
  const [cancelling, setCancelling] = useState<CoverageRow | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  // Filters are server-side: the params are the query key. No filter = the same query that feeds the chip counts.
  const params: AgencyCoverageQuery = {
    ...(status !== "all" && { status }),
    ...(role !== "all" && { role }),
    ...(date && { date }),
    ...(search.trim() && { q: search.trim() }),
  };
  const filtered = Object.keys(params).length > 0;
  const all = useAgencyCoverage();
  const list = useAgencyCoverage(params);

  const everything = useMemo(() => all.data?.shifts ?? [], [all.data]);
  const counts = useMemo(() => {
    const st = { all: everything.length, open: 0, filled: 0, cancelled: 0, completed: 0 };
    const ro = { all: everything.length, RN: 0, LPN: 0, CNA: 0 };
    for (const s of everything) {
      st[s.status]++;
      ro[s.role]++;
    }
    return { st, ro };
  }, [everything]);
  const visible = useMemo(
    () => [...(list.data?.shifts ?? [])].sort((a, b) => (sort === "asc" ? 1 : -1) * sortKey(a).localeCompare(sortKey(b))),
    [list.data, sort],
  );

  const agencyName = membership?.name ?? "this agency";
  const viewerNote = "View-only access: owners and managers can post and change shifts.";
  const resetFilters = () => {
    setStatus("all");
    setRole("all");
    setDate("");
  };
  const clearFilters = () => {
    resetFilters();
    setSearch("");
  };
  // Non-default filters inside the dropdown (the search box lives outside it).
  const activeCount = (status !== "all" ? 1 : 0) + (role !== "all" ? 1 : 0) + (date ? 1 : 0);

  const postButton = (
    <Button
      data-testid="agency-post-shift-button"
      onClick={() => setPosting(true)}
      disabled={!canWrite}
      aria-describedby={canWrite ? undefined : "ag-viewer-note"}
    >
      <Icon name="plus" />
      Post shift
    </Button>
  );

  const actions = {
    canWrite,
    onDetails: setDetails,
    onWithdraw: setWithdrawing,
    onCancel: setCancelling,
    onNurse: setNurseOf,
  };

  const statusOptions: { value: Status; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.st.all },
    { value: "open", label: "Open", count: counts.st.open },
    { value: "filled", label: "Filled", count: counts.st.filled },
    { value: "cancelled", label: "Cancelled", count: counts.st.cancelled },
  ];
  if (counts.st.completed > 0 || status === "completed") statusOptions.push({ value: "completed", label: "Completed", count: counts.st.completed });
  const roleOptions: { value: Role; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.ro.all },
    { value: "RN", label: "RN", count: counts.ro.RN },
    { value: "LPN", label: "LPN", count: counts.ro.LPN },
    { value: "CNA", label: "CNA", count: counts.ro.CNA },
  ];

  return (
    <>
      <PageHeader
        title="Shifts"
        description={
          <>
            {all.data && (
              <>
                <span data-testid="agency-shift-count">
                  {counts.st.all} {counts.st.all === 1 ? "shift" : "shifts"}
                </span>
                {" · "}
              </>
            )}
            Facility-local time, 24-hour.
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                void all.refetch();
                if (filtered) void list.refetch();
              }}
              aria-busy={all.isFetching || list.isFetching}
              disabled={all.isFetching || list.isFetching}
            >
              <Icon name="refresh" />
              Refresh
            </Button>
            {postButton}
          </>
        }
      />
      {!canWrite && membership && (
        <p id="ag-viewer-note" className="alert al-info ag-note">
          <Icon name="lock" />
          <span>{viewerNote}</span>
        </p>
      )}
      <OfflineBanner />

      {all.isPending ? (
        <ListSkeleton variant={desktop ? "table" : "card"} rows={3} />
      ) : all.isError ? (
        <ErrorState title="Couldn't load shifts" message={all.error.message} onRetry={() => void all.refetch()} />
      ) : everything.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="No shifts posted yet"
          action={
            canWrite ? (
              <Button onClick={() => setPosting(true)}>
                <Icon name="plus" />
                Post shift
              </Button>
            ) : undefined
          }
        >
          {canWrite ? "Post your first shift and nurses will see it right away." : "Shifts this agency posts will appear here."}
        </EmptyState>
      ) : (
        <>
          <section aria-label="Summary" className="stat-grid">
            <StatTile label="Open" value={counts.st.open} icon="dot" />
            <StatTile label="Filled" value={counts.st.filled} icon="check-circle" />
            <StatTile label="Cancelled" value={counts.st.cancelled} icon="ban" />
            <StatTile label="Open in next 7 days" value={openNextWeek(everything)} icon="cal" />
          </section>
          <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
            <FilterDropdown label="Filters" activeCount={activeCount} onReset={resetFilters}>
              <div className="col" style={{ gap: 16 }}>
                <FilterGroup label="Status" value={status} onChange={setStatus} options={statusOptions} />
                <FilterGroup label="Role" value={role} onChange={setRole} options={roleOptions} />
                <div className="fgroup">
                  <label htmlFor="ag-date" className="fgroup-l">
                    Date
                  </label>
                  <span className="ag-date">
                    <Input id="ag-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    {date && (
                      <Button variant="secondary" size="sm" onClick={() => setDate("")} aria-label="Clear date filter">
                        <Icon name="x" />
                      </Button>
                    )}
                  </span>
                </div>
              </div>
            </FilterDropdown>
            <SearchInput label="Search by nurse name" placeholder="Nurse name" value={search} onChange={setSearch} />
          </div>
          {!desktop && (
            <div>
              <Button variant="secondary" size="sm" onClick={() => setSort((s) => (s === "asc" ? "desc" : "asc"))}>
                <Icon name="cal" />
                {sort === "asc" ? "Soonest first" : "Latest first"}
              </Button>
            </div>
          )}
          {list.isPending ? (
            <ListSkeleton variant={desktop ? "table" : "card"} rows={3} />
          ) : list.isError ? (
            <ErrorState title="Couldn't load shifts" message={list.error.message} onRetry={() => void list.refetch()} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon="search"
              title={status === "all" ? "No matching shifts" : `No ${status} shifts`}
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filter
                </Button>
              }
            >
              Nothing matches these filters for {agencyName}.
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
          clearFilters();
          setHighlight(shift.id);
        }}
      />
      <ShiftDetailsDialog
        shift={details}
        canWrite={canWrite}
        onClose={() => setDetails(null)}
        onViewNurse={setNurseOf}
        onWithdraw={(s) => {
          setDetails(null);
          setWithdrawing(s);
        }}
        onCancel={(s) => {
          setDetails(null);
          setCancelling(s);
        }}
      />
      <ShiftNurseDialog shift={nurseOf} onClose={() => setNurseOf(null)} />
      <WithdrawDialog shift={withdrawing} onClose={() => setWithdrawing(null)} />
      <CancelDialog shift={cancelling} onClose={() => setCancelling(null)} />
    </>
  );
}

interface RowActions {
  canWrite: boolean;
  onDetails: (s: CoverageRow) => void;
  onWithdraw: (s: CoverageRow) => void;
  onCancel: (s: CoverageRow) => void;
  onNurse: (s: CoverageRow) => void;
}

/** Nurse name; owners/managers get a button to the nurse's details (viewers get plain text: the API 404s them). */
function Claimant({ shift, canWrite, onNurse }: { shift: CoverageRow; canWrite: boolean; onNurse: (s: CoverageRow) => void }) {
  if (!shift.claimedByName) return <span className="muted">—</span>;
  if (!canWrite) return <span>{shift.claimedByName}</span>;
  return (
    <button type="button" className="ag-link" onClick={() => onNurse(shift)} aria-label={`${shift.claimedByName}, view nurse details`}>
      {shift.claimedByName}
    </button>
  );
}

/**
 * Withdraw (open) / Cancel (filled) / nothing. The spec's `shift-cancel-button` is the NURSE's one-click cancel of a
 * claimed shift; the agency cancel needs a reason (no-show vs advance), so it opens a dialog and has its own ID.
 */
function RowAction({ shift, canWrite, onWithdraw, onCancel, block }: RowActions & { shift: CoverageRow; block?: boolean }) {
  const label = shiftSummary(shift);
  const cls = block ? "flex-1" : undefined;
  if (!canWrite || (shift.status !== "open" && shift.status !== "filled")) return null;
  return shift.status === "open" ? (
    <Button variant="danger" size="sm" className={cls} onClick={() => onWithdraw(shift)} aria-label={`Withdraw, ${label}`}>
      Withdraw
    </Button>
  ) : (
    <Button variant="danger" size="sm" className={cls} onClick={() => onCancel(shift)} aria-label={`Cancel shift, ${label}`} data-testid="agency-cancel-shift-button">
      Cancel shift
    </Button>
  );
}

function When({ shift }: { shift: CoverageRow }) {
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
}: RowActions & { shifts: CoverageRow[]; sort: Sort; onSort: () => void; highlight: string | null; agencyName: string }) {
  return (
    <div className="card scrollx">
      <table className="tbl ag-tbl">
        <caption className="sr">Shifts posted by {agencyName}</caption>
        <thead>
          <tr>
            <th scope="col">Role</th>
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
              </th>
              <td>
                <When shift={s} />
              </td>
              <td>
                <StatusBadge status={s.status} />
              </td>
              <td>
                <Claimant shift={s} canWrite={actions.canWrite} onNurse={actions.onNurse} />
              </td>
              <td className="ag-cell-act">
                <span className="ag-acts">
                  <Button variant="secondary" size="sm" onClick={() => actions.onDetails(s)} aria-label={`Details, ${shiftSummary(s)}`}>
                    Details
                  </Button>
                  <RowAction shift={s} {...actions} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShiftCards({ shifts, highlight, ...actions }: RowActions & { shifts: CoverageRow[]; highlight: string | null }) {
  return (
    <ul className="ag-cards">
      {shifts.map((s) => (
        <li key={s.id} className={`card ag-card${s.id === highlight ? " ag-new" : ""}`}>
          <div className="row between">
            <span className="role">{s.role}</span>
            <StatusBadge status={s.status} />
          </div>
          <When shift={s} />
          <div className="ag-card-claim">
            <span className="muted">Claimed by</span> <Claimant shift={s} canWrite={actions.canWrite} onNurse={actions.onNurse} />
          </div>
          <div className="ag-card-actions">
            <Button variant="secondary" size="sm" className="flex-1" onClick={() => actions.onDetails(s)} aria-label={`Details, ${shiftSummary(s)}`}>
              Details
            </Button>
            <RowAction shift={s} {...actions} block />
          </div>
        </li>
      ))}
    </ul>
  );
}
