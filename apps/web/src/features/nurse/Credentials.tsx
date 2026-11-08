"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import { useState } from "react";
import type { CredentialType, NurseCredential } from "@shiftpatch/contracts";
import { AppBar } from "@/components/shells/NurseShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { OfflineBanner, useOnline } from "@/components/ui/OfflineBanner";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/format";
import { useCredentials } from "./queries";
import { UploadCredentialForm } from "./UploadCredentialDialog";

const uploadedFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export function credentialLabel(c: Pick<NurseCredential, "type" | "licenseType">): string {
  if (c.type === "license") return c.licenseType ? `Nursing license (${c.licenseType})` : "Nursing license";
  return c.type === "tb_screening" ? "TB screening" : "Other document";
}

function credentialMeta(c: NurseCredential): string {
  const parts: string[] = [];
  if (c.screenedOn) parts.push(`Screened ${formatDate(c.screenedOn)}`);
  if (c.expiresOn) parts.push(`${c.expired ? "Expired" : "Valid until"} ${formatDate(c.expiresOn)}`);
  parts.push(`uploaded ${uploadedFmt.format(new Date(c.uploadedAt))}`);
  const text = parts.join(" · ");
  return text[0]!.toUpperCase() + text.slice(1);
}

function LicenseSummary({ valid, hasExpired, onUpload }: { valid: boolean; hasExpired: boolean; onUpload: () => void }) {
  if (valid) {
    return (
      <div className="alert al-ok" role="status">
        <Icon name="shield" size="lg" />
        <div>
          <b>License on file</b> You can claim shifts that match your license.
        </div>
      </div>
    );
  }
  return (
    <div className="alert al-warn nurse-notice" role="status">
      <Icon name="cal-x" size="lg" />
      <div>
        <b>{hasExpired ? "Your license has expired." : "No valid license on file."}</b> Upload a renewed license to claim shifts.
        <button type="button" className="nurse-notice-link" onClick={onUpload}>
          Upload license
          <Icon name="arrow" size="sm" />
        </button>
      </div>
    </div>
  );
}

export function Credentials() {
  const creds = useCredentials();
  const online = useOnline();
  // Every "Upload" action presets the inline form's type and moves focus to it (no dialog: QA D3).
  const [uploadType, setUploadTypeState] = useState<CredentialType>("license");
  const setUploadType = (type: CredentialType) => {
    setUploadTypeState(type);
    const form = document.getElementById("upload");
    form?.scrollIntoView?.({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === false ? "smooth" : "auto", block: "start" });
    form?.querySelector<HTMLElement>("select, input")?.focus({ preventScroll: true });
  };

  const list = (creds.data?.credentials ?? []).toSorted((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  return (
    <>
      <AppBar title="Credentials">
        <button type="button" className="btn btn-primary nurse-appbar-btn" disabled={!online} onClick={() => setUploadType("license")}>
          <Icon name="plus" size="sm" />
          Add credential
        </button>
      </AppBar>
      <div className="body nurse-stack">
        <OfflineBanner />
        {creds.isPending ? (
          <ListSkeleton rows={2} />
        ) : creds.isError ? (
          <ErrorState title="Couldn't load credentials" message={creds.error.message} onRetry={() => void creds.refetch()} />
        ) : (
          <>
            <LicenseSummary
              valid={creds.data.licenseValid}
              hasExpired={list.some((c) => c.type === "license" && c.expired)}
              onUpload={() => setUploadType("license")}
            />
            {list.length > 0 ? (
              <section aria-labelledby="creds-h">
                <h2 id="creds-h" className="nurse-list-h tnum">
                  On file · {list.length}
                </h2>
                <ul className="card-grid">
                  {list.map((c) => (
                    <li key={c.id}>
                      <article className="card nurse-cred">
                        <div className="row between nurse-card-top">
                          <h3>{credentialLabel(c)}</h3>
                          <StatusBadge status={c.expired ? "expired" : c.status} />
                        </div>
                        <p className="muted tnum nurse-cred-meta">
                          <Icon name="cal" size="sm" />
                          {credentialMeta(c)}
                        </p>
                        {(c.expired || c.status === "rejected") && (
                          <button type="button" className="nurse-notice-link" disabled={!online} onClick={() => setUploadType(c.type)}>
                            Upload {c.expired ? "renewal" : "a new copy"}
                            <Icon name="arrow" size="sm" />
                          </button>
                        )}
                      </article>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <EmptyState
                icon="idcard"
                title="No credentials yet"
                action={
                  <button type="button" className="btn btn-primary" onClick={() => setUploadType("license")}>
                    <Icon name="upload" />
                    Upload license
                  </button>
                }
              >
                Upload your nursing license to start claiming shifts.
              </EmptyState>
            )}
          </>
        )}
        <UploadCredentialForm type={uploadType} disabled={!online} />
      </div>
    </>
  );
}
