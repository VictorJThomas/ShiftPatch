"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built
import Link from "next/link";
import { Alert } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { ApiError } from "@/lib/api-client";
import { OwnerOnly } from "./InspectionPage";
import { expiryText, toCsv } from "./model";
import { useOpenDocument, usePackage } from "./queries";

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Saves the CSV the browser built from the JSON already on screen. Nothing is sent anywhere. */
function downloadCsv(csv: string, name: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const DOC_LABEL = { license: "License", tb_screening: "TB screening" } as const;

function Body({ id, backHref }: { id: string; backHref: string }) {
  const q = usePackage(id);
  const open = useOpenDocument(id);
  if (q.isPending) return <ListSkeleton variant="table" rows={4} />;
  if (q.isError) {
    const status = q.error instanceof ApiError ? q.error.status : 0;
    if (status === 410) {
      return (
        <EmptyState icon="clock" title="This package has expired">
          Inspection packages expire after 24 hours or when they are revoked. <Link href={backHref} className="underline">Create a new one</Link>.
        </EmptyState>
      );
    }
    if (status === 404) return <EmptyState icon="search" title="Package not found">It may not exist, or it belongs to someone else. <Link href={backHref} className="underline">Back to packages</Link></EmptyState>;
    return <ErrorState title="Couldn't load the package" message={q.error.message} onRetry={() => void q.refetch()} />;
  }
  const { package: p, nurses, documents } = q.data;
  return (
    <>
      <Alert variant="info" role="status" className="mb-4" data-testid="inspection-expiry">
        <Icon name="clock" />
        <span>
          <strong>{expiryText(p.expiresAt)}</strong> ({fmt(p.expiresAt)}). Period {p.from} → {p.to}, {p.nurseCount} nurse{p.nurseCount === 1 ? "" : "s"}. Created by {p.createdByName}.
        </span>
      </Alert>
      <div className="no-print mb-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => downloadCsv(toCsv(q.data), `inspection-${p.from}-${p.to}.csv`)}>
          <Icon name="file" />
          Download CSV
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>Print</Button>
      </div>

      <section className="card" aria-label="Summary">
        <div className="scrollx">
          <table className="tbl adm-tbl" data-testid="inspection-summary-table">
            <caption className="sr">Credential summary per nurse</caption>
            <thead>
              <tr>
                <th scope="col">Nurse</th>
                <th scope="col">License</th>
                <th scope="col">Number / state</th>
                <th scope="col">Expires</th>
                <th scope="col">Status</th>
                <th scope="col">Verified by</th>
                <th scope="col">TB screening</th>
              </tr>
            </thead>
            <tbody>
              {nurses.flatMap((n) => {
                const tb = n.tb.onFile ? `On file · ${n.tb.screenedOn ?? "no date"} · ${n.tb.status}` : "Not on file";
                const rows = n.licenses.length > 0 ? n.licenses : [null];
                return rows.map((l, i) => (
                  <tr key={`${n.nurseId}-${i}`}>
                    {i === 0 ? (
                      <th scope="row" rowSpan={rows.length}>
                        {n.name}
                        <div className="muted">{n.email}</div>
                      </th>
                    ) : null}
                    <td>{l?.licenseType ?? "—"}</td>
                    <td>{l ? [l.number, l.issuingState].filter(Boolean).join(" · ") || "—" : "No license on file"}</td>
                    <td className="num">{l?.expiresOn ?? "—"}</td>
                    <td>{l?.status ?? "—"}</td>
                    <td>{l?.verifiedByName ? `${l.verifiedByName}${l.verifiedAt ? ` · ${fmt(l.verifiedAt)}` : ""}` : "—"}</td>
                    {i === 0 ? <td rowSpan={rows.length}>{tb}</td> : null}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </section>

      {p.includeDocuments && (
        <section className="no-print mt-6" aria-labelledby="insp-docs">
          <h2 id="insp-docs" className="mb-2 text-lg font-bold">Documents</h2>
          {documents.length === 0 ? (
            <p className="muted">No documents on file for these nurses.</p>
          ) : (
            <ul className="card" style={{ padding: 12 }} data-testid="inspection-documents">
              {documents.map((d) => (
                <li key={d.credentialId} className="flex items-center justify-between gap-3 py-1.5">
                  <span>{d.nurseName} · {DOC_LABEL[d.type]}</span>
                  <Button size="sm" variant="secondary" loading={open.isPending && open.variables === d.credentialId} aria-label={`Open ${DOC_LABEL[d.type]} document for ${d.nurseName}`} onClick={() => open.mutate(d.credentialId)}>
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="muted mt-2">Each Open creates a 5-minute link and is logged.</p>
        </section>
      )}
    </>
  );
}

export function PackageView({ id, basePath }: { id: string; basePath: string }) {
  return (
    <OwnerOnly>
      <PageHeader
        title="Inspection package"
        description={<Link href={basePath} className="no-print underline">← All packages</Link>}
      />
      <Body id={id} backHref={basePath} />
    </OwnerOnly>
  );
}
