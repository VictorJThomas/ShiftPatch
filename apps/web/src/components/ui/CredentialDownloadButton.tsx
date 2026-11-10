"use client";

import "@/lib/zod-csp"; // first: the contracts import below builds zod schemas
import { CredentialDownloadResponse } from "@shiftpatch/contracts";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/shadcn/button";
import { apiFetch } from "@/lib/api-client";
import { showError } from "@/lib/format-error";
import { Icon } from "./Icon";

/**
 * Downloads one credential file. The 5-minute signed link is fetched on click (never in advance: it expires, and each fetch is
 * one audit row), then opened by navigation: the object is stored as an attachment, so the page stays and no popup blocker fires.
 * No CSP change: a navigation is not governed by connect-src.
 */
export function CredentialDownloadButton({ credentialId, label }: { credentialId: string; label: string }) {
  const m = useMutation({
    mutationFn: () => apiFetch(`/api/credentials/${encodeURIComponent(credentialId)}/download-url`, { schema: CredentialDownloadResponse }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: showError,
  });
  return (
    <Button variant="secondary" size="sm" loading={m.isPending} aria-label={`Download ${label}`} onClick={() => m.mutate()}>
      <Icon name="file" />
      Download
    </Button>
  );
}
