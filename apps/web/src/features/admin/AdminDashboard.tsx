"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built
import type { Shift } from "@shiftpatch/contracts";
import { useEffect, useMemo, useState } from "react";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime, formatShiftWhen, isOvernight, relativeFrom, shiftHours } from "@/lib/format";
import {
  type AgencyCoverage, agenciesOf, countByStatus, coverageByAgency, fillRate, filterShifts, matchesBase, NO_FILTERS, paginate,
  POLL_MS, SHIFT_STATUSES, type ShiftFilters, type SortDir, sortByDate, type StatusCounts, type StatusFilter,
} from "./model";
import { useAdminShifts } from "./queries";

/** Re-renders every second so "updated N s ago" ticks between polls. */
function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const STATUS_LABEL: Record<StatusFilter, string> = { all: "All", open: "Open", filled: "Filled", cancelled: "Cancelled", completed: "Completed" };

/** Hospital-network admin: live coverage across every agency (GET /api/shifts, polled every 15 s). */
export function AdminDashboard() {
  const q = useAdminShifts({ live: true });
  const shifts = q.data;
  return (
    <>
      <PageHeader
        title="Coverage"
        description="All agencies in your network · facility-local time, 24-hour"
        actions={shifts && <LiveStatus updatedAt={q.dataUpdatedAt} fetching={q.isFetching} onRefresh={() => void q.refetch()} />}
      />
      {q.isPending ? (
        <ListSkeleton variant="table" rows={6} />
      ) : !shifts ? (
        <ErrorState title="Couldn't load coverage" message={q.error?.message ?? "Something went wrong. Try again."} onRetry={() => void q.refetch()} />
      ) : (
        <>
          {q.isError && (
            <div className="alert al-err adm-stale" role="alert">
              <Icon name="alert-circle" />
              <div>
                <b>Live updates paused</b>
                Couldn&apos;t refresh. Showing data from {formatDateTime(new Date(q.dataUpdatedAt))}, retrying every {POLL_MS / 1000} s.
              </div>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => void q.refetch()}>
                <Icon name="refresh" />
                Retry now
              </button>
            </div>
          )}
          {shifts.length > 0 && (
            <>
              <StatTiles shifts={shifts} />
              <CoverageByAgency rows={coverageByAgency(shifts)} />
            </>
          )}
          <ShiftTable shifts={shifts} />
        </>
      )}
    </>
  );
}

function LiveStatus({ updatedAt, fetching, onRefresh }: { updatedAt: number; fetching: boolean; onRefresh: () => void }) {
  const now = useNow();
  return (
    <div className="adm-live">
      {/* aria-live off: a ticking counter must not chatter in screen readers. */}
      <p className="pill-live" aria-live="off">
        <i aria-hidden="true" />
        <span>
          <b>Live</b> · updated {relativeFrom(new Date(updatedAt), new Date(now))} · refreshes every {POLL_MS / 1000} s
        </span>
      </p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onRefresh} disabled={fetching} aria-busy={fetching}>
        <Icon name="refresh" />
        {fetching ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}

const shortName = (name: string) => name.split(/\s+/)[0] ?? name;

function perAgency(rows: AgencyCoverage[], status: keyof StatusCounts) {
  return rows.map((r) => `${shortName(r.name)} ${r.counts[status]}`).join(" · ");
}

function StatTiles({ shifts }: { shifts: Shift[] }) {
  const c = countByStatus(shifts);
  const rows = coverageByAgency(shifts);
  const rate = fillRate(c);
  return (
    <section aria-label="Shift totals" className="adm-stats">
      {(["open", "filled", "cancelled"] as const).map((s) => (
        <div key={s} className="card stat">
          <span className="l">
            <StatusBadge status={s} />
          </span>
          <span className="n">{c[s]}</span>
          <span className="sub">{perAgency(rows, s)}</span>
        </div>
      ))}
      <div className="card stat">
        <span className="l">
          <Icon name="check-circle" />
          Fill rate
        </span>
        <span className="n">{rate === null ? "—" : `${rate}%`}</span>
        <span className="sub">{rate === null ? "No open or filled shifts" : `${c.filled} of ${c.open + c.filled} open or filled shifts are filled`}</span>
      </div>
    </section>
  );
}

function CoverageByAgency({ rows }: { rows: AgencyCoverage[] }) {
  return (
    <section className="card" aria-labelledby="cov-h">
      <h2 id="cov-h" className="adm-sec-h">
        Coverage by agency
      </h2>
      <p className="adm-sec-sub">Fill rate = filled ÷ (open + filled).</p>
      <div className="scrollx">
        <table className="tbl">
          <caption className="sr">Shift counts and fill rate per agency</caption>
          <thead>
            <tr>
              <th scope="col">Agency</th>
              <th scope="col">Open</th>
              <th scope="col">Filled</th>
              <th scope="col">Cancelled</th>
              <th scope="col">Fill rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row" className="adm-rowh">
                  {r.name}
                </th>
                <td className="num">{r.counts.open}</td>
                <td className="num">{r.counts.filled}</td>
                <td className="num">{r.counts.cancelled}</td>
                <td className="num">
                  <span className="adm-rate">
                    <span className="adm-meter" aria-hidden="true">
                      <i style={{ width: `${r.rate ?? 0}%` }} />
                    </span>
                    {r.rate === null ? "—" : `${r.rate}%`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ShiftTable({ shifts }: { shifts: Shift[] }) {
  const [filters, setFilters] = useState<ShiftFilters>(NO_FILTERS);
  const [dir, setDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const agencies = useMemo(() => agenciesOf(shifts), [shifts]);
  const update = (patch: Partial<ShiftFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const base = shifts.filter((s) => matchesBase(s, filters));
  const counts = countByStatus(base);
  const statusOptions = [
    { value: "all" as StatusFilter, label: "All", count: base.length },
    ...SHIFT_STATUSES.filter((s) => s !== "completed" || counts.completed > 0).map((s) => ({ value: s as StatusFilter, label: STATUS_LABEL[s], count: counts[s] })),
  ];
  const view = paginate(sortByDate(filterShifts(shifts, filters), dir), page);
  const filtered = filters.agencyId !== "all" || filters.status !== "all" || filters.search.trim() !== "";
  const sortLabel = dir === "asc" ? "earliest first" : "latest first";

  return (
    <section className="card" aria-labelledby="shifts-h">
      <h2 id="shifts-h" className="adm-sec-h">
        All shifts
      </h2>
      <p className="adm-sec-sub">Every shift posted by agencies in your network.</p>
      <div className="adm-toolbar">
        <Field label="Agency">
          {(p) => (
            <Select {...p} value={filters.agencyId} onChange={(e) => update({ agencyId: e.target.value })}>
              <option value="all">All agencies</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="fld grow">
          <label className="lbl" htmlFor="adm-search">
            Search
          </label>
          <div className="inp">
            <Icon name="search" className="muted" />
            <input id="adm-search" type="search" placeholder="Shift id, agency or nurse id" value={filters.search} onChange={(e) => update({ search: e.target.value })} />
          </div>
        </div>
        {filtered && (
          <button type="button" className="btn btn-ghost" onClick={() => update(NO_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>
      <div className="adm-chips">
        <ChipGroup label="Status" options={statusOptions} value={filters.status} onChange={(status) => update({ status })} />
      </div>
      <div className="scrollx">
        <table data-testid="admin-dashboard-shift-table" className="tbl adm-tbl">
          <caption className="sr">
            Shifts in your network, sorted by date, {sortLabel}. Page {view.page} of {view.pages}.
          </caption>
          <thead>
            <tr>
              <th scope="col">Shift</th>
              <th scope="col">Agency</th>
              <th scope="col">Role</th>
              <th scope="col" aria-sort={dir === "asc" ? "ascending" : "descending"}>
                <button type="button" onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}>
                  Date / time
                  <Icon name={dir === "asc" ? "down" : "right"} size="sm" />
                  <span className="sr">, sorted {sortLabel}. Activate to reverse.</span>
                </button>
              </th>
              <th scope="col">Status</th>
              <th scope="col">Claimed by</th>
            </tr>
          </thead>
          <tbody>
            {view.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-cell">
                  {shifts.length === 0 ? (
                    <EmptyState icon="grid" title="No shifts in your network yet">
                      Shifts appear here as soon as an agency posts one.
                    </EmptyState>
                  ) : (
                    <EmptyState
                      icon="search"
                      title="No shifts match"
                      action={
                        <button type="button" className="btn btn-secondary" onClick={() => update(NO_FILTERS)}>
                          Clear filters
                        </button>
                      }
                    >
                      Try another agency, status or search.
                    </EmptyState>
                  )}
                </td>
              </tr>
            ) : (
              view.items.map((s) => (
                <tr key={s.id}>
                  <td className="adm-id">{s.id}</td>
                  <td>
                    <b>{s.agencyName}</b>
                  </td>
                  <td>
                    <span className="role">{s.role}</span>
                  </td>
                  <td className="num">
                    {formatShiftWhen(s)}
                    {isOvernight(s) && <span className="muted"> · overnight</span>}
                    <span className="muted"> · {shiftHours(s)} h</span>
                  </td>
                  <td>
                    <StatusBadge status={s.status} testId="admin-shift-status-badge" />
                  </td>
                  <td>{s.claimedBy ? <span className="adm-id">{s.claimedBy}</span> : <span className="muted">— <span className="sr">Unclaimed</span></span>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="adm-foot">
        <span className="tnum" aria-live="polite">
          {view.total === 0 ? "0 shifts" : `${view.from}–${view.to} of ${view.total} shifts`}
        </span>
        {view.pages > 1 && (
          <nav className="adm-pager" aria-label="Shift table pages">
            <button type="button" className="btn btn-secondary btn-sm" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)} aria-label="Previous page">
              <Icon name="left" />
              Prev
            </button>
            <span className="tnum">
              Page {view.page} of {view.pages}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={view.page >= view.pages} onClick={() => setPage(view.page + 1)} aria-label="Next page">
              Next
              <Icon name="right" />
            </button>
          </nav>
        )}
      </div>
    </section>
  );
}
