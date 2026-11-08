"use client";

import type { ReactNode } from "react";
import { Dialog, type DialogProps } from "./Dialog";

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
  /** Request in flight: spinner, both buttons disabled, Esc/backdrop ignored. */
  pending?: boolean;
  confirmTestId?: string;
  variant?: DialogProps["variant"];
}

/** Yes/no confirmation on top of `Dialog`. Confirm is the primary (or danger) action; cancel never mutates. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel,
  cancelLabel = "Go back",
  tone = "primary",
  pending = false,
  confirmTestId,
  variant = "sheet",
}: ConfirmDialogProps) {
  const close = () => {
    if (!pending) onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      variant={variant}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={close} disabled={pending}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${tone === "danger" ? "btn-danger-solid" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending || undefined}
            data-testid={confirmTestId}
          >
            {pending && <span className="spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
