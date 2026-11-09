"use client";

import "@/lib/zod-csp"; // first: the contracts import below builds zod schemas
import type { NurseCredential } from "@shiftpatch/contracts";
import { DetailList } from "@/components/ui/DetailList";
import { Dialog } from "@/components/ui/Dialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate, formatDateTime } from "@/lib/format";
import { credentialLabel, credentialTypeLabel } from "@/lib/credential-label";

/** Read-only details of one credential. Only what the API returns: no file key, no download link. */
export function CredentialDetailDialog({ credential, onClose }: { credential: NurseCredential | null; onClose: () => void }) {
  const c = credential;
  return (
    <Dialog open={!!c} onClose={onClose} variant="modal" title={c ? credentialLabel(c) : "Credential"}>
      {c && (
        <DetailList
          items={[
            { label: "Status", icon: "shield", value: <StatusBadge status={c.expired ? "expired" : c.status} /> },
            { label: "Type", icon: "idcard", value: credentialTypeLabel(c.type) },
            { label: "License type", value: c.licenseType },
            { label: c.expired ? "Expired on" : "Valid until", icon: "cal", value: c.expiresOn ? formatDate(c.expiresOn) : null },
            { label: "Screened on", icon: "cal", value: c.screenedOn ? formatDate(c.screenedOn) : null },
            { label: "Uploaded", icon: "clock", value: formatDateTime(c.uploadedAt) },
            { label: "File", icon: "file", value: c.hasFile ? "On file" : "No file" },
          ]}
        />
      )}
    </Dialog>
  );
}
