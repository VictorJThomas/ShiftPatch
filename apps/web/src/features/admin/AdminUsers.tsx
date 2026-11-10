"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built
import type { AdminUserRow, AdminUserType } from "@shiftpatch/contracts";
import { useState } from "react";
import { Button } from "@/components/shadcn/button";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { AgencyDetailDialog, NurseReviewDialog } from "./UserDialogs";
import { useAdminUsers } from "./queries";

const TABS: { value: AdminUserType; label: string }[] = [
  { value: "nurse", label: "Nurses" },
  { value: "agency", label: "Agencies" },
];

/** Hospital-network admin: every nurse and agency in the network, with credential review on nurses. */
export function AdminUsers() {
  const [type, setType] = useState<AdminUserType>("nurse");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const q = useAdminUsers(type, search);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const noun = type === "nurse" ? "nurses" : "agencies";
  const searching = search.trim() !== "";

  return (
    <>
      <PageHeader title="Users" description="Nurses and agencies in your network. Review nurse credentials here." />
      <section className="card" aria-labelledby="users-h">
        <h2 id="users-h" className="sr">
          Network users
        </h2>
        <div className="adm-toolbar">
          <ChipGroup label="User type" options={TABS} value={type} onChange={(v) => setType(v)} />
          <div className="fld grow">
            <SearchInput label={`Search ${noun}`} placeholder="Name or email" value={search} onChange={setSearch} />
          </div>
        </div>
        <div className="scrollx" aria-busy={q.isFetching}>
          {q.isPending ? (
            <ListSkeleton variant="table" rows={6} />
          ) : q.isError ? (
            <ErrorState title={`Couldn't load ${noun}`} message={q.error.message} onRetry={() => void q.refetch()} />
          ) : items.length === 0 ? (
            searching ? (
              <EmptyState
                icon="search"
                title={`No ${noun} match`}
                action={
                  <Button variant="secondary" onClick={() => setSearch("")}>
                    Clear search
                  </Button>
                }
              >
                Try another name or email.
              </EmptyState>
            ) : (
              <EmptyState icon="user" title={`No ${noun} yet`}>
                {type === "nurse" ? "Nurses appear here once they register." : "Agencies appear here once they join your network."}
              </EmptyState>
            )
          ) : (
            <table data-testid="admin-users-table" className="tbl adm-tbl">
              <caption className="sr">{type === "nurse" ? "Nurses" : "Agencies"} in your network</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  {type === "nurse" && <th scope="col">License</th>}
                  <th scope="col">
                    <span className="sr">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <b>{u.name}</b>
                    </td>
                    <td>{u.email ?? <span className="muted">—</span>}</td>
                    {type === "nurse" && (
                      <td>
                        {u.licenseType ? <span className="role">{u.licenseType}</span> : <span className="muted">—</span>}
                      </td>
                    )}
                    <td>
                      <Button variant="ghost" size="sm" aria-label={`View details for ${u.name}`} onClick={() => setSelected(u)}>
                        <Icon name="eye" />
                        View details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {items.length > 0 && (
          <div className="adm-foot">
            <span className="tnum" aria-live="polite">
              Showing {items.length} {noun}
            </span>
            {q.hasNextPage && (
              <Button variant="secondary" size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                {q.isFetchingNextPage ? "Loading…" : `Load more ${noun}`}
              </Button>
            )}
          </div>
        )}
      </section>
      <NurseReviewDialog nurseId={selected?.type === "nurse" ? selected.id : null} onClose={() => setSelected(null)} />
      <AgencyDetailDialog agencyId={selected?.type === "agency" ? selected.id : null} onClose={() => setSelected(null)} />
    </>
  );
}
