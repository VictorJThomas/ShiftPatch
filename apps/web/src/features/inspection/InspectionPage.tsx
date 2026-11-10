"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/shadcn/alert";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { useSessionStore } from "@/stores/session";
import { buildRequest, defaultPeriod, expiryText, type FormValues, formError, packageState, periodError, pruneSelection, setIncludeDocuments, toggleNurse } from "./model";
import { useCandidates, useGeneratePackage, usePackages, useRevokePackage } from "./queries";

/** Agency: owners only (the API enforces it; this hides the screen). Admins always pass. */
export function useCanInspect(): boolean {
  const role = useSessionStore((s) => s.user?.role);
  const activeId = useSessionStore((s) => s.activeAgencyId);
  const membership = useSessionStore((s) => s.agencies.find((a) => a.agencyId === activeId));
  return role === "admin" || (role === "agency" && membership?.role === "owner");
}

export function OwnerOnly({ children }: { children: React.ReactNode }) {
  if (useCanInspect()) return <>{children}</>;
  return (
    <EmptyState icon="lock" title="Owners only">
      Inspection packages contain nurse license and TB records. Only an agency owner can create or open them.
    </EmptyState>
  );
}

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function StateChip({ p }: { p: Parameters<typeof packageState>[0] }) {
  const state = packageState(p);
  if (state === "active") return null;
  return <Badge variant={state === "revoked" ? "rejected" : "expired"}>{state === "revoked" ? "Revoked" : "Expired"}</Badge>;
}

function PackageList({ basePath }: { basePath: string }) {
  const q = usePackages();
  const revoke = useRevokePackage();
  const [target, setTarget] = useState<string | null>(null);
  if (q.isPending) return <ListSkeleton variant="table" rows={3} />;
  if (q.isError) return <ErrorState title="Couldn't load packages" message={q.error.message} onRetry={() => void q.refetch()} />;
  if (q.data.length === 0) return <EmptyState icon="file" title="No packages yet">Create one above. It expires after 24 hours.</EmptyState>;
  return (
    <>
      <div className="scrollx">
        <table className="tbl adm-tbl" data-testid="inspection-package-table">
          <caption className="sr">Inspection packages</caption>
          <thead>
            <tr>
              <th scope="col">Created</th>
              <th scope="col">By</th>
              <th scope="col">Period</th>
              <th scope="col">Nurses</th>
              <th scope="col">Contents</th>
              <th scope="col">Expiry</th>
              <th scope="col"><span className="sr">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((p) => {
              const usable = packageState(p) === "active";
              return (
                <tr key={p.id}>
                  <td>{fmt(p.createdAt)}</td>
                  <td>{p.createdByName}</td>
                  <td className="num">{p.from} → {p.to}</td>
                  <td className="num">{p.nurseCount}</td>
                  <td>{p.includeDocuments ? (p.includeTbDocuments ? "Summary + license + TB documents" : "Summary + license documents") : "Summary only"}</td>
                  <td>
                    {usable ? <span>{expiryText(p.expiresAt)}</span> : <StateChip p={p} />}
                  </td>
                  <td>
                    {usable && (
                      <span className="flex gap-2">
                        <Button asChild size="sm" variant="secondary"><Link href={`${basePath}/${encodeURIComponent(p.id)}`}>Open</Link></Button>
                        <Button size="sm" variant="secondary" aria-label={`Revoke package from ${fmt(p.createdAt)}`} onClick={() => setTarget(p.id)}>Revoke</Button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        onConfirm={() => target && revoke.mutate(target, { onSettled: () => setTarget(null) })}
        title="Revoke this package?"
        confirmLabel="Revoke"
        tone="danger"
        pending={revoke.isPending}
      >
        Anyone who opens it will see that it expired. This cannot be undone.
      </ConfirmDialog>
    </>
  );
}

function GenerateForm({ basePath }: { basePath: string }) {
  const initial = useMemo(defaultPeriod, []);
  const [v, setV] = useState<FormValues>({ ...initial, nurseIds: [], includeDocuments: false, includeTbDocuments: false });
  const [created, setCreated] = useState<string | null>(null);
  const pErr = periodError(v.from, v.to);
  const cands = useCandidates(v.from, v.to, pErr === null);
  const generate = useGeneratePackage();
  const idKey = cands.data?.map((n) => n.id).join(",");
  useEffect(() => {
    if (idKey !== undefined) setV((cur) => pruneSelection(cur, idKey.split(",")));
  }, [idKey]);
  const err = formError(v);

  return (
    <section className="card" aria-labelledby="insp-new" style={{ padding: 20, marginBottom: 24 }}>
      <h2 id="insp-new" className="text-lg font-bold" style={{ marginBottom: 12 }}>New inspection package</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (err) return;
          generate.mutate(buildRequest(v), { onSuccess: (r) => { setCreated(r.package.id); setV((c) => ({ ...c, nurseIds: [] })); } });
        }}
        noValidate
      >
        <div className="flex flex-wrap gap-4">
          <Field label="From" error={pErr ?? undefined}>{(p) => <Input {...p} type="date" value={v.from} onChange={(e) => setV({ ...v, from: e.target.value })} />}</Field>
          <Field label="To">{(p) => <Input {...p} type="date" value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} />}</Field>
        </div>

        <fieldset className="mb-4">
          <legend className="mb-1.5 text-sm font-[650]">Nurses ({v.nurseIds.length} selected)</legend>
          {pErr ? <p className="muted">Choose a valid period to list nurses.</p> : cands.isPending ? <p aria-busy="true">Loading nurses…</p> : cands.isError ? (
            <ErrorState title="Couldn't load nurses" message={cands.error.message} onRetry={() => void cands.refetch()} />
          ) : cands.data.length === 0 ? (
            <p className="muted">No nurses in scope for this period.</p>
          ) : (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={() => setV({ ...v, nurseIds: v.nurseIds.length === cands.data.length ? [] : cands.data.map((n) => n.id) })}>
                {v.nurseIds.length === cands.data.length ? "Clear selection" : "Select all"}
              </Button>
              <ul className="mt-2 grid gap-1" data-testid="inspection-nurse-list" style={{ maxHeight: 280, overflow: "auto" }}>
                {cands.data.map((n) => (
                  <li key={n.id}>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={v.nurseIds.includes(n.id)} onChange={() => setV(toggleNurse(v, n.id))} />
                      <span>{n.name}</span>
                      <span className="muted">License: {n.licenseStatus}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </fieldset>

        <div className="mb-4 grid gap-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={v.includeDocuments} onChange={(e) => setV(setIncludeDocuments(v, e.target.checked))} />
            Attach license documents
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={v.includeTbDocuments} disabled={!v.includeDocuments} onChange={(e) => setV({ ...v, includeTbDocuments: e.target.checked })} />
            Attach TB documents <span className="muted">(requires license documents)</span>
          </label>
        </div>

        <Alert variant="info" role="note" className="mb-4">
          <Icon name="shield" />
          <span>
            Packages hold nurses&apos; license and health records. Send them only to the inspector, expect them to expire in 24 hours, and revoke them when done.
            Every view and download is logged. TB documents are off by default; without them you only share that a screening is on file and its date.
          </span>
        </Alert>

        {err && v.nurseIds.length > 0 && <p role="alert" className="mb-2 text-destructive">{err}</p>}
        <Button type="submit" loading={generate.isPending} disabled={err !== null}>Create package</Button>
        {created && (
          <p role="status" className="mt-3">
            Package ready. <Link href={`${basePath}/${encodeURIComponent(created)}`} className="underline">Open it</Link>
          </p>
        )}
      </form>
    </section>
  );
}

/** Shared by /admin/inspection and /agency/inspection. `basePath` is where the package view lives. */
export function InspectionPage({ basePath }: { basePath: string }) {
  return (
    <OwnerOnly>
      <PageHeader title="Inspection packages" description="Share a scoped, expiring summary of nurse licenses and TB screening with an inspector." />
      <GenerateForm basePath={basePath} />
      <h2 className="mb-2 text-lg font-bold">Your packages</h2>
      <section className="card" aria-label="Packages"><PackageList basePath={basePath} /></section>
    </OwnerOnly>
  );
}
