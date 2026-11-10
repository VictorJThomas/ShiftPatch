"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built
import { useState } from "react";
import { Button } from "@/components/shadcn/button";
import { AppDialog } from "@/components/ui/AppDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DetailList } from "@/components/ui/DetailList";
import { Icon } from "@/components/ui/Icon";
import { NurseDetailDialog } from "@/components/ui/NurseDetailDialog";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { credentialLabel } from "@/lib/credential-label";
import { useAdminAgency, useAdminNurse, useReviewCredential } from "./queries";

const closeFooter = (onClose: () => void) => (
  <Button variant="secondary" onClick={onClose}>
    Close
  </Button>
);

/** Nurse detail with Verify / Reject on every credential (the shared dialog's `credentialActions` slot). Reject asks first. */
export function NurseReviewDialog({ nurseId, onClose }: { nurseId: string | null; onClose: () => void }) {
  const q = useAdminNurse(nurseId);
  const review = useReviewCredential(nurseId ?? "");
  const [rejecting, setRejecting] = useState<{ id: string; label: string } | null>(null);
  const pendingId = review.isPending ? review.variables?.id : null;
  return (
    <>
      <NurseDetailDialog
        open={!!nurseId}
        onClose={onClose}
        nurse={q.data}
        loading={q.isPending}
        error={q.isError || !q.data ? (q.error?.message ?? "Something went wrong. Try again.") : undefined}
        onRetry={() => void q.refetch()}
        footer={closeFooter(onClose)}
        blockClose={review.isPending}
        credentialActions={(c) => {
          const label = credentialLabel(c);
          const busy = pendingId === c.id;
          return (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={c.status === "verified" || review.isPending}
                aria-busy={busy && review.variables?.status === "verified"}
                aria-label={`Verify ${label}`}
                onClick={() => review.mutate({ id: c.id, status: "verified", label })}
              >
                <Icon name="check" />
                Verify
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={c.status === "rejected" || review.isPending}
                aria-busy={busy && review.variables?.status === "rejected"}
                aria-label={`Reject ${label}`}
                onClick={() => setRejecting({ id: c.id, label })}
              >
                <Icon name="x" />
                Reject
              </Button>
            </>
          );
        }}
      />
      <ConfirmDialog
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title={rejecting ? `Reject ${rejecting.label}?` : "Reject credential?"}
        confirmLabel="Reject"
        tone="danger"
        pending={review.isPending}
        size="sm"
        onConfirm={() => {
          if (rejecting) review.mutate({ id: rejecting.id, status: "rejected", label: rejecting.label }, { onSettled: () => setRejecting(null) });
        }}
      >
        <p>The nurse will see this credential as rejected and may lose eligibility to claim shifts. You can verify it again later.</p>
      </ConfirmDialog>
    </>
  );
}

/** Agency profile (read-only) with its members. */
export function AgencyDetailDialog({ agencyId, onClose }: { agencyId: string | null; onClose: () => void }) {
  const q = useAdminAgency(agencyId);
  const a = q.data;
  return (
    <AppDialog size="md" open={!!agencyId} onClose={onClose} title="Agency details" footer={closeFooter(onClose)}>
      {q.isPending ? (
        <ListSkeleton variant="table" rows={3} />
      ) : q.isError || !a ? (
        <ErrorState message={q.error?.message ?? "Something went wrong. Try again."} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <DetailList
            items={[
              { label: "Name", value: a.name, icon: "building" },
              { label: "Status", value: a.status === "active" ? "Active" : "Suspended" },
              { label: "Email", value: a.email, icon: "mail" },
              { label: "Phone", value: a.phone, icon: "phone" },
              { label: "Location", value: [a.city, a.state].filter(Boolean).join(", "), icon: "pin" },
              { label: "Shifts", value: `${a.shiftCounts.open} open · ${a.shiftCounts.filled} filled · ${a.shiftCounts.cancelled} cancelled · ${a.shiftCounts.completed} completed` },
            ]}
          />
          <h3 className="nd-h">Members</h3>
          {a.members.length === 0 ? (
            <p className="muted">No members.</p>
          ) : (
            <ul className="nd-creds">
              {a.members.map((m) => (
                <li key={m.userId}>
                  <div>
                    <b>{m.name}</b>
                    <span className="muted">{m.email}</span>
                  </div>
                  <span className="role">{m.role}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </AppDialog>
  );
}
