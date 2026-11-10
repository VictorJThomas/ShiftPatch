"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/shadcn/button";
import { AppDialog, type AppDialogSize } from "./AppDialog";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  /** Defaults to "Go back" (design: Nurse-Detail-Claim). */
  cancelLabel?: string;
  tone?: "primary" | "danger";
  /** Request in flight: spinner, both buttons disabled, Esc/overlay/X ignored. */
  pending?: boolean;
  confirmTestId?: string;
  /** Default "sm". */
  size?: AppDialogSize;
  /** @deprecated Ignored; use `size`. */
  variant?: "sheet" | "modal" | "panel";
}

/** Yes/no confirmation on top of `AppDialog`. Confirm is the primary (or danger) action; cancel never mutates. */
export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel, cancelLabel = "Go back", tone = "primary", pending = false, confirmTestId, size = "sm" }: ConfirmDialogProps) {
  return (
    <AppDialog
      open={open}
      onClose={onClose}
      blockClose={pending}
      title={title}
      size={size}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "destructive" : "default"} onClick={onConfirm} loading={pending} data-testid={confirmTestId}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </AppDialog>
  );
}
