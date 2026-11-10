"use client";

import "@/lib/zod-csp"; // first: credential-file pulls in the contracts (zod)
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { ApiError } from "@/lib/api-client";
import { browserShowsPdf, credentialFileName, CredentialFileError, loadCredentialFile, previewKind, type CredentialFile } from "@/lib/credential-file";
import { FALLBACK_ERROR } from "@/lib/format-error";
import { AppDialog } from "./AppDialog";
import { useCredentialDownload } from "./CredentialDownloadButton";
import { EmptyState } from "./EmptyState";
import { Icon } from "./Icon";
import { ErrorState } from "./States";

export const credentialFileKey = (credentialId: string) => ["credential-file", credentialId] as const;

/**
 * The file is fetched when the dialog opens (fresh signed link, one audit row) and dropped when it closes: `gcTime: 0`
 * plus both observers unmounting with the dialog content, so document bytes never linger in the query cache.
 */
function useCredentialFile(credentialId: string) {
  return useQuery({
    queryKey: credentialFileKey(credentialId),
    queryFn: ({ signal }) => loadCredentialFile(credentialId, signal),
    gcTime: 0,
    staleTime: Infinity, // one fetch per opening; Retry refetches (a new link)
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** Typed `blob:` URL for the bytes, revoked on change and on unmount (dialog close). */
function useObjectUrl(file: CredentialFile | undefined, render: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file?.type || !render) return;
    const u = URL.createObjectURL(new Blob([file.bytes], { type: file.type }));
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
      setUrl(null);
    };
  }, [file, render]);
  return url;
}

/** Saves already-loaded bytes under the stored file name; `octet-stream` so the browser saves rather than renders. */
function saveBytes(file: CredentialFile & { type: NonNullable<CredentialFile["type"]> }) {
  const url = URL.createObjectURL(new Blob([file.bytes], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = credentialFileName(file.type);
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const errorMessage = (err: unknown) => (err instanceof ApiError || err instanceof CredentialFileError ? err.message : FALLBACK_ERROR);

function PreviewBody({ credentialId, label }: { credentialId: string; label: string }) {
  const q = useCredentialFile(credentialId);
  const kind = q.data ? previewKind(q.data.type, browserShowsPdf()) : "none";
  const src = useObjectUrl(q.data, kind !== "none");

  // Fetching first: a Retry after an error shows the loader again, not the stale error.
  if (q.isPending || q.isFetching || (kind !== "none" && !src)) {
    return (
      <div aria-busy="true" className="h-[70dvh] max-[719px]:h-full">
        <span className="sr" role="status">
          Loading document…
        </span>
        <Skeleton aria-hidden="true" className="size-full rounded-md" />
      </div>
    );
  }
  if (q.isError) return <ErrorState title="Couldn't load the preview" message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  if (kind === "pdf" && src) {
    return <iframe src={src} title={`${label}, document preview`} className="block h-[70dvh] w-full rounded-md border border-border bg-muted max-[719px]:h-full" />;
  }
  if (kind === "image" && src) {
    return (
      <div className="flex h-full min-h-60 items-center justify-center rounded-md bg-muted p-2">
        {/* Plain <img>: a local blob: URL, nothing for next/image to optimise. */}
        <img src={src} alt={`${label}, document preview`} className="block max-h-[70dvh] max-w-full rounded-sm object-contain max-[719px]:max-h-full" />
      </div>
    );
  }
  const type = q.data?.type;
  const why = type === "image/heic" ? "HEIC photos can't be shown in a browser. " : type === "application/pdf" ? "This browser can't show PDFs inline. " : "";
  return (
    <EmptyState icon="file" title={type === "application/pdf" ? "Preview not available on this device" : "Preview not available for this file type"}>
      {why}Download the file to open it.
    </EmptyState>
  );
}

function DownloadAction({ credentialId, label }: { credentialId: string; label: string }) {
  const q = useCredentialFile(credentialId);
  const fallback = useCredentialDownload(credentialId);
  const file = q.data;
  return (
    <Button
      aria-label={`Download ${label}`}
      loading={fallback.isPending}
      // Bytes already here: save them (instant, no second link). Otherwise the usual signed-link navigation.
      onClick={() => (file?.type ? saveBytes({ ...file, type: file.type }) : fallback.mutate())}
    >
      <Download aria-hidden="true" className="size-[18px]" />
      Download
    </Button>
  );
}

export interface CredentialPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  credentialId: string;
  /** Human label of the credential, e.g. "Nursing license (RN)": dialog title and the preview's accessible name. */
  label: string;
}

/** Previews a credential document in place (PDF in a frame, JPEG/PNG as an image; HEIC and others: a fallback) with Download. */
export function CredentialPreviewDialog({ open, onClose, credentialId, label }: CredentialPreviewDialogProps) {
  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={label}
      size="lg"
      testId="credential-preview-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <DownloadAction credentialId={credentialId} label={label} />
        </>
      }
    >
      <PreviewBody credentialId={credentialId} label={label} />
    </AppDialog>
  );
}

/** "View file" next to Download: same visibility rule (the caller shows both only when the credential has a file). */
export function CredentialViewButton({ credentialId, label }: { credentialId: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" aria-haspopup="dialog" aria-label={`View ${label}`} onClick={() => setOpen(true)}>
        <Icon name="eye" />
        View file
      </Button>
      <CredentialPreviewDialog open={open} onClose={() => setOpen(false)} credentialId={credentialId} label={label} />
    </>
  );
}
