"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built
import type { AuditLogEntry } from "@shiftpatch/contracts";
import { useMemo, useState } from "react";
import { Alert } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { AppDialog } from "@/components/ui/AppDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Select } from "@/components/ui/Field";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { formatDateTime } from "@/lib/format";
import {
  actionLabel, agenciesOf, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, type AuditFilters, entityLabel, formatChanges, invalidRange, NO_AUDIT_FILTERS,
} from "./model";
import { useAdminShifts, useAuditLog } from "./queries";

const ROLE_LABEL: Record<string, string> = { admin: "Admin", agency: "Agency", nurse: "Nurse" };
/** Changes longer than this (or more than 2 fields) get an expand button. */
const MAX_INLINE = 2;
const MAX_CHARS = 60;

/** Read-only audit trail for the admin's network (GET /api/audit-logs, cursor paging with "Load more"). */
export function AuditLog() {
  const [filters, setFilters] = useState<AuditFilters>(NO_AUDIT_FILTERS);
  const [detail, setDetail] = useState<AuditLogEntry | null>(null);
  const q = useAuditLog(filters);
  // Agency names come from the shifts the admin already sees (no agencies endpoint); ids still work without them.
  const shifts = useAdminShifts();
  const agencies = useMemo(() => agenciesOf(shifts.data ?? []), [shifts.data]);
  const agencyName = (id: string | null) => (id ? (agencies.find((a) => a.id === id)?.name ?? id) : null);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const set = (patch: Partial<AuditFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const activeCount = Object.values(filters).filter((v) => v !== "").length;
  const filtered = activeCount > 0;
  const badRange = invalidRange(filters);

  return (
    <>
      <PageHeader title="Audit log" description="Every action by every user in your network. Read-only, newest first." />
      <section className="card" aria-labelledby="audit-h">
        <h2 id="audit-h" className="sr">
          Audit entries
        </h2>
        <div className="adm-toolbar">
          <FilterDropdown label="Filters" activeCount={activeCount} onReset={() => setFilters(NO_AUDIT_FILTERS)}>
            <div className="flex flex-col gap-4">
          <Field label="Action">
            {(p) => (
              <Select {...p} value={filters.action} onChange={(e) => set({ action: e.target.value })}>
                <option value="">All actions</option>
                {Object.entries(AUDIT_ACTIONS).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Item type">
            {(p) => (
              <Select {...p} value={filters.entityType} onChange={(e) => set({ entityType: e.target.value })}>
                <option value="">All items</option>
                {Object.entries(AUDIT_ENTITY_TYPES).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Agency">
            {(p) => (
              <Select {...p} value={filters.agencyId} onChange={(e) => set({ agencyId: e.target.value })}>
                <option value="">All agencies</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="From">{(p) => <Input {...p} type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} />}</Field>
          <Field label="To" error={badRange ? "End date is before the start date" : undefined}>
            {(p) => <Input {...p} type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} />}
          </Field>
            </div>
          </FilterDropdown>
        </div>
        {q.isPending ? (
          <ListSkeleton variant="table" rows={8} />
        ) : q.isError && items.length === 0 ? (
          <ErrorState title="Couldn't load the audit log" message={q.error.message} onRetry={() => void q.refetch()} />
        ) : (
          <>
            <div className="scrollx" aria-busy={q.isFetching}>
              <table data-testid="audit-log-table" className="tbl adm-tbl">
                <caption className="sr">Audit log entries, newest first</caption>
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Action</th>
                    <th scope="col">Item</th>
                    <th scope="col">Agency</th>
                    <th scope="col">Changes</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty-cell">
                        <EmptyState
                          icon="file"
                          title={filtered ? "No entries match these filters" : "No audit entries yet"}
                          action={
                            filtered ? (
                              <Button variant="secondary" onClick={() => setFilters(NO_AUDIT_FILTERS)}>
                                Reset filters
                              </Button>
                            ) : undefined
                          }
                        >
                          {filtered ? "Try another action, agency or date range." : "Actions on shifts, credentials and sessions are recorded here."}
                        </EmptyState>
                      </td>
                    </tr>
                  ) : (
                    items.map((e) => {
                      const changes = formatChanges(e.changes);
                      const long = changes.length > MAX_INLINE || changes.some((c) => c.length > MAX_CHARS);
                      return (
                        <tr key={e.id}>
                          <td className="num">
                            <time dateTime={e.occurredAt} title={e.occurredAt}>
                              {formatDateTime(e.occurredAt)}
                            </time>
                          </td>
                          <td>
                            {e.actorUserId ? <span className="adm-id">{e.actorUserId}</span> : <span className="muted">Unknown</span>}
                            {e.actorRole && <span className="tag adm-role">{ROLE_LABEL[e.actorRole] ?? e.actorRole}</span>}
                          </td>
                          <td className="act">
                            {actionLabel(e.action)}
                            <code>{e.action}</code>
                          </td>
                          <td className="act">
                            {entityLabel(e.entityType)}
                            <code>{e.entityId}</code>
                          </td>
                          <td>{agencyName(e.agencyId) ?? <span className="muted">—</span>}</td>
                          <td>
                            {changes.length === 0 ? (
                              <span className="muted">—</span>
                            ) : (
                              <>
                                <ul className="adm-changes">
                                  {changes.slice(0, MAX_INLINE).map((c) => (
                                    <li key={c} title={c}>
                                      {c}
                                    </li>
                                  ))}
                                </ul>
                                {long && (
                                  <Button variant="ghost" size="sm" onClick={() => setDetail(e)} aria-label={`Show all changes for ${actionLabel(e.action)} ${e.entityId}`}>
                                    Show all
                                  </Button>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {q.isError && (
              <Alert variant="destructive" role="alert" className="m-4">
                Couldn&apos;t load more entries: {q.error.message}
              </Alert>
            )}
            <div className="adm-foot">
              <span className="tnum" aria-live="polite">
                Showing {items.length} {items.length === 1 ? "entry" : "entries"}
                {q.hasNextPage ? " · more available" : ""}
              </span>
              {q.hasNextPage && (
                <Button variant="secondary" size="sm" onClick={() => void q.fetchNextPage()} loading={q.isFetchingNextPage}>
                  {q.isFetchingNextPage ? "Loading…" : "Load more entries"}
                </Button>
              )}
            </div>
          </>
        )}
      </section>
      <AppDialog size="lg" open={detail !== null} onClose={() => setDetail(null)} title="All changes" description={detail ? `${actionLabel(detail.action)} · ${detail.entityId}` : undefined}>
        {detail && <pre className="adm-full">{formatChanges(detail.changes).join("\n")}</pre>}
      </AppDialog>
    </>
  );
}
