"use client";

import type { NurseDetail } from "@shiftpatch/contracts";
import type { ReactNode } from "react";
import { credentialLabel } from "@/lib/credential-label";
import { formatDate } from "@/lib/format";
import { DetailList } from "./DetailList";
import { AppDialog } from "./AppDialog";
import { CredentialDownloadButton } from "./CredentialDownloadButton";
import { CredentialViewButton } from "./CredentialViewButton";
import { ErrorState, ListSkeleton } from "./States";
import { StatusBadge } from "./StatusBadge";

export type NurseDetailData = NurseDetail;

export interface NurseDetailDialogProps {
  open: boolean;
  onClose: () => void;
  nurse?: NurseDetailData;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  footer?: ReactNode;
  title?: string;
  /** Per-credential actions (admin Verify / Reject). Omit for a read-only list. */
  credentialActions?: (credential: NurseDetailData["credentials"][number]) => ReactNode;
  /** True while a credential action is in flight: Esc, overlay and X do nothing. */
  blockClose?: boolean;
}

/** Presentational nurse info + credentials list. The caller fetches the data and owns `open`. */
export function NurseDetailDialog({ open, onClose, nurse, loading, error, onRetry, footer, title = "Nurse details", credentialActions, blockClose }: NurseDetailDialogProps) {
  return (
    <AppDialog open={open} onClose={onClose} title={title} footer={footer} size="md" blockClose={blockClose}>
      {loading ? (
        <ListSkeleton variant="table" rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry ?? onClose} />
      ) : nurse ? (
        <>
          <DetailList
            items={[
              { label: "Name", value: nurse.name, icon: "user" },
              { label: "Email", value: nurse.email, icon: "mail" },
              { label: "License type", value: nurse.licenseType, icon: "idcard" },
            ]}
          />
          <h3 className="nd-h">Credentials</h3>
          {nurse.credentials.length === 0 ? (
            <p className="muted">No credentials on file.</p>
          ) : (
            <ul className="nd-creds">
              {nurse.credentials.map((c) => (
                <li key={c.id} className={credentialActions || c.hasFile ? "adm-cred" : undefined}>
                  <div>
                    <b>{credentialLabel(c)}</b>
                    <span className="muted">{c.expiresOn ? `${c.expired ? "Expired" : "Expires"} ${formatDate(c.expiresOn)}` : c.screenedOn ? `Screened ${formatDate(c.screenedOn)}` : "No expiry"}</span>
                  </div>
                  <StatusBadge status={c.status} />
                  {(credentialActions || c.hasFile) && (
                    <div className="adm-cred-acts">
                      {c.hasFile && (
                        <>
                          <CredentialViewButton credentialId={c.id} label={credentialLabel(c)} />
                          <CredentialDownloadButton credentialId={c.id} label={credentialLabel(c)} />
                        </>
                      )}
                      {credentialActions?.(c)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </AppDialog>
  );
}
