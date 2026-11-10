"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built
import type { CoverageRow, Shift } from "@shiftpatch/contracts";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Select } from "@/components/ui/Field";
import { FilterBar, FilterGroup } from "@/components/ui/FilterBar";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { StatTile } from "@/components/ui/StatTile";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime, formatShiftWhen, isOvernight, relativeFrom, shiftHours } from "@/lib/format";
import {
  type AgencyCoverage, agenciesOf, countByStatus, coverageByAgency, fillRate, PAGE_SIZE, POLL_MS, SHIFT_STATUSES, type SortDir,   type StatusCounts, type StatusFilter,
} from "./model";
import { useAdminCoverage, useAdminShifts } from "./queries";
import { ShiftDetailsDialog } from "./ShiftDetailsDialog";

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

/**
 * Hospital-network admin: live coverage across every agency, polled every 15 s. Stat tiles and coverage-by-agency need
 * every shift (GET /api/shifts); the "All shifts" table is server-driven (GET /api/admin/coverage).
 */
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
            <Alert variant="destructive" role="alert" className="mb-4 flex-wrap items-center">
              <Icon name="alert-circle" />
              <div className="min-w-60 flex-1">
                <b>Live updates paused</b>
                Couldn&apos;t refresh. Showing data from {formatDateTime(new Date(q.dataUpdatedAt))}, retrying every {POLL_MS / 1000} s.
              </div>
              <Button variant="danger" size="sm" onClick={() => void q.refetch()}>
                <Icon name="refresh" />
                Retry now
              </Button>
            </Alert>
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
      <Button variant="secondary" size="sm" onClick={onRefresh} disabled={fetching} aria-busy={fetching}>
        <Icon name="refresh" />
        {fetching ? "Refreshing…" : "Refresh"}
      </Button>
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
    <section aria-label="Shift totals" className="stat-grid adm-stats">
      <StatTile label="Open" icon="dot" value={c.open} hint={perAgency(rows, "open")} />
      <StatTile label="Filled" icon="check-circle" value={c.filled} hint={perAgency(rows, "filled")} />
      <StatTile label="Cancelled" icon="ban" value={c.cancelled} hint={perAgency(rows, "cancelled")} />
      <StatTile
        label="Fill rate"
        icon="shield"
        tone="brand"
        value={rate === null ? "—" : `${rate}%`}
        hint={rate === null ? "No open or filled shifts" : `${c.filled} of ${c.open + c.filled} open or filled shifts are filled`}
      />
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

const ZERO: StatusCounts = { open: 0, filled: 0, cancelled: 0, completed: 0 };

function ShiftTable({ shifts }: { shifts: Shift[] }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [agencyId, setAgencyId] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dir, setDir] = useState<SortDir>("asc");
  const [detail, setDetail] = useState<CoverageRow | null>(null);
  // Agency options come from every shift (the unfiltered query), never from the filtered page.
  const agencies = useMemo(() => agenciesOf(shifts), [shifts]);
  const cov = useAdminCoverage({ status, agencyId, q: search, page, sort: dir });
  const data = cov.data;
  const reset = (patch: { status?: StatusFilter; agencyId?: string; search?: string }) => {
    if (patch.status !== undefined) setStatus(patch.status);
    if (patch.agencyId !== undefined) setAgencyId(patch.agencyId);
    if (patch.search !== undefined) setSearch(patch.search);
    setPage(1);
  };
  const toggleSort = () => {
    setDir((d) => (d === "asc" ? "desc" : "asc"));
    setPage(1);
  };
  const clear = () => reset({ status: "all", agencyId: "all", search: "" });
  const clearFilters = () => reset({ status: "all", agencyId: "all" });

  const counts = data?.statusCounts ?? ZERO;
  const statusOptions = [
    { value: "all" as StatusFilter, label: "All", count: data ? counts.open + counts.filled + counts.cancelled + counts.completed : undefined },
    ...SHIFT_STATUSES.filter((s) => s !== "completed" || counts.completed > 0 || status === "completed").map((s) => ({
      value: s as StatusFilter, label: STATUS_LABEL[s], count: data ? counts[s] : undefined,
    })),
  ];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (data?.pageSize ?? PAGE_SIZE)));
  // The 15 s poll can shrink the result set under the current page: step back instead of showing an empty page.
  useEffect(() => {
    if (data && !cov.isPlaceholderData && page > pages) setPage(pages);
  }, [data, cov.isPlaceholderData, page, pages]);
  const from = !data || total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = !data || total === 0 ? 0 : from + data.shifts.length - 1;
  const rows = data?.shifts ?? []; // the server sorts globally (sort=asc|desc)
  const activeCount = (status !== "all" ? 1 : 0) + (agencyId !== "all" ? 1 : 0);
  const filtered = agencyId !== "all" || status !== "all" || search.trim() !== "";
  const sortLabel = dir === "asc" ? "earliest first" : "latest first";

  return (
    <section className="card" aria-labelledby="shifts-h">
      <h2 id="shifts-h" className="adm-sec-h">
        All shifts
      </h2>
      <p className="adm-sec-sub">Every shift posted by agencies in your network.</p>
      <div className="adm-toolbar">
        <div className="fld grow">
          <SearchInput label="Search shifts" placeholder="Agency or nurse name" value={search} onChange={(v) => reset({ search: v })} />
        </div>
        <FilterDropdown label="Filters" activeCount={activeCount} onReset={clearFilters}>
          <div className="flex flex-col gap-4">
            <Field label="Agency">
              {(p) => (
                <Select {...p} value={agencyId} onChange={(e) => reset({ agencyId: e.target.value })}>
                  <option value="all">All agencies</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <FilterBar label="Shift filters">
              <FilterGroup label="Status" options={statusOptions} value={status} onChange={(v) => reset({ status: v })} />
            </FilterBar>
          </div>
        </FilterDropdown>
        {filtered && (
          <Button variant="ghost" onClick={clear}>
            Clear filters
          </Button>
        )}
      </div>
      <div className="scrollx" aria-busy={cov.isFetching}>
        <table data-testid="admin-dashboard-shift-table" className="tbl adm-tbl">
          <caption className="sr">
            Shifts in your network, sorted by date, {sortLabel}. Page {data?.page ?? 1} of {pages}.
          </caption>
          <thead>
            <tr>
              <th scope="col">Shift</th>
              <th scope="col">Agency</th>
              <th scope="col">Role</th>
              <th scope="col" aria-sort={dir === "asc" ? "ascending" : "descending"}>
                <button type="button" onClick={toggleSort}>
                  Date / time
                  <Icon name={dir === "asc" ? "down" : "right"} size="sm" />
                  <span className="sr">, sorted {sortLabel}. Activate to reverse.</span>
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
            {cov.isPending ? (
              <tr>
                <td colSpan={7} className="empty-cell">
                  <ListSkeleton variant="table" rows={5} />
                </td>
              </tr>
            ) : !data ? (
              <tr>
                <td colSpan={7} className="empty-cell">
                  <ErrorState title="Couldn't load shifts" message={cov.error?.message ?? "Something went wrong. Try again."} onRetry={() => void cov.refetch()} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-cell">
                  {filtered ? (
                    <EmptyState
                      icon="search"
                      title="No shifts match"
                      action={
                        <Button variant="secondary" onClick={clear}>
                          Clear filters
                        </Button>
                      }
                    >
                      Try another agency, status or name.
                    </EmptyState>
                  ) : (
                    <EmptyState icon="grid" title="No shifts in your network yet">
                      Shifts appear here as soon as an agency posts one.
                    </EmptyState>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((s) => (
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
                  <td>
                    {s.claimedByName ?? (
                      <span className="muted">
                        — <span className="sr">Unclaimed</span>
                      </span>
                    )}
                  </td>
                  <td>
                    <Button variant="ghost" size="sm" aria-label={`View details for shift ${s.id}`} onClick={() => setDetail(s)}>
                      <Icon name="eye" />
                      View details
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {cov.isError && data && (
        <Alert variant="destructive" role="alert" className="m-4 items-center">
          <Icon name="alert-circle" />
          <div className="flex-1">Couldn&apos;t refresh the table. Showing the last loaded page.</div>
          <Button variant="danger" size="sm" onClick={() => void cov.refetch()}>
            Retry
          </Button>
        </Alert>
      )}
      {data && (
        <div className="adm-foot">
          <span className="tnum" aria-live="polite">
            {total === 0 ? "0 shifts" : `${from}–${to} of ${total} shifts`}
          </span>
          {pages > 1 && (
            <nav className="adm-pager" aria-label="Shift table pages">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
                <Icon name="left" />
                Prev
              </Button>
              <span className="tnum">
                Page {data.page} of {pages}
              </span>
              <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">
                Next
                <Icon name="right" />
              </Button>
            </nav>
          )}
        </div>
      )}
      <ShiftDetailsDialog shift={detail} onClose={() => setDetail(null)} />
    </section>
  );
}
