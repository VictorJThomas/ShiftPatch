"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import Link from "next/link";
import { useState } from "react";
import type { NurseCredential } from "@shiftpatch/contracts";
import { Alert } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { AppBar, UserAvatar } from "@/components/shells/NurseShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/format";
import { credentialLabel } from "@/lib/credential-label";
import { CredentialDetailDialog } from "./CredentialDetailDialog";
import { useCredentials } from "./queries";
import { newCredentialHref } from "./credential-upload";

const uploadedFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

function credentialMeta(c: NurseCredential): string {
  const parts: string[] = [];
  if (c.screenedOn) parts.push(`Screened ${formatDate(c.screenedOn)}`);
  if (c.expiresOn) parts.push(`${c.expired ? "Expired" : "Valid until"} ${formatDate(c.expiresOn)}`);
  parts.push(`uploaded ${uploadedFmt.format(new Date(c.uploadedAt))}`);
  const text = parts.join(" · ");
  return text[0]!.toUpperCase() + text.slice(1);
}

function LicenseSummary({ valid, hasExpired }: { valid: boolean; hasExpired: boolean }) {
  if (valid) {
    return (
      <Alert variant="success" role="status">
        <Icon name="shield" size="lg" />
        <div>
          <b>License on file</b> You can claim shifts that match your license.
        </div>
      </Alert>
    );
  }
  return (
    <Alert variant="warning" role="status" className="nurse-notice">
      <Icon name="cal-x" size="lg" />
      <div>
        <b>{hasExpired ? "Your license has expired." : "No valid license on file."}</b> Upload a renewed license to claim shifts.
        <Link href={newCredentialHref("license")} className="nurse-notice-link">
          Upload license
          <Icon name="arrow" size="sm" />
        </Link>
      </div>
    </Alert>
  );
}

export function Credentials() {
  const creds = useCredentials();
  const [selected, setSelected] = useState<NurseCredential | null>(null);

  const list = (creds.data?.credentials ?? []).toSorted((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  return (
    <>
      <AppBar title="Credentials">
        <Button asChild className="min-h-[var(--tap)] max-[400px]:gap-1 max-[400px]:px-2.5 max-[400px]:text-sm">
          <Link href={newCredentialHref("license")}>
            <Icon name="plus" size="sm" />
            Add credential
          </Link>
        </Button>
        <UserAvatar />
      </AppBar>
      <div className="body nurse-stack">
        <OfflineBanner />
        {creds.data && (
          <LicenseSummary
            valid={creds.data.licenseValid}
            hasExpired={list.some((c) => c.type === "license" && c.expired)}
          />
        )}
        {creds.isPending ? (
          <ListSkeleton rows={2} />
        ) : creds.isError ? (
          <ErrorState title="Couldn't load credentials" message={creds.error.message} onRetry={() => void creds.refetch()} />
        ) : list.length > 0 ? (
          <section aria-labelledby="creds-h">
            <h2 id="creds-h" className="nurse-list-h tnum">
              On file · {list.length}
            </h2>
            <ul className="card-grid">
              {list.map((c) => (
                <li key={c.id}>
                  <article className="card nurse-cred">
                    <div className="row between nurse-card-top">
                      {/* The title is the real button; its ::after stretches over the whole card (nurse.css). */}
                      <h3>
                        <button type="button" className="nurse-cred-open" onClick={() => setSelected(c)}>
                          {credentialLabel(c)}
                        </button>
                      </h3>
                      <StatusBadge status={c.expired ? "expired" : c.status} />
                    </div>
                    <p className="muted tnum nurse-cred-meta">
                      <Icon name="cal" size="sm" />
                      {credentialMeta(c)}
                    </p>
                    <span className="nurse-cred-more" aria-hidden="true">
                      View details
                      <Icon name="right" size="sm" />
                    </span>
                    {(c.expired || c.status === "rejected") && (
                      <Link href={newCredentialHref(c.type)} className="nurse-notice-link">
                        Upload {c.expired ? "renewal" : "a new copy"}
                        <Icon name="arrow" size="sm" />
                      </Link>
                    )}
                  </article>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <EmptyState
            icon="idcard"
            title="No credentials found"
            action={
              <Button asChild>
                <Link href={newCredentialHref("license")}>
                  <Icon name="upload" />
                  Upload license
                </Link>
              </Button>
            }
          >
            Add your first license or screening.
          </EmptyState>
        )}
      </div>
      <CredentialDetailDialog credential={selected} onClose={() => setSelected(null)} />
    </>
  );
}
