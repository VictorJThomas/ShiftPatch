"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { dialogClosed, dialogOpened } from "@/stores/dialogs";
import { Icon } from "./Icon";
import { Toaster } from "./Toaster";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** sheet: bottom sheet <720px, centered ≥720 · modal: centered · panel: right side panel ≥720, full-height sheet <720. */
  variant?: "sheet" | "modal" | "panel";
}

/**
 * Native `<dialog>` + `showModal()`: the browser gives us the focus trap, Esc, top layer and inert background.
 * Esc / backdrop click / close button all call `onClose`; the parent owns `open`. Body scroll lock is CSS
 * (`html:has(.dlg[open])`). Content only mounts while open, so test IDs inside never exist twice.
 */
export function Dialog({ open, onClose, title, description, children, footer, variant = "modal" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    dialogOpened();
    return () => {
      dialogClosed();
      if (dialog.open) dialog.close();
      returnTo?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <dialog
      ref={ref}
      className={`dlg dlg-${variant}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      // Esc: keep React in charge of `open` instead of letting the browser close the element.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click whose press and release both land on the dialog box itself = the backdrop (content fills the box).
      onPointerDown={(e) => (downOnBackdrop.current = e.target === e.currentTarget)}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dlg-box">
        {/* The page is inert behind a modal: feedback for actions taken in here must render in here. */}
        <Toaster inline />
        {variant !== "modal" && <div className="grab" aria-hidden="true" />}
        <div className="dlg-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={titleId}>{title}</h2>
            {description && (
              <p id={descId} className="dlg-desc">
                {description}
              </p>
            )}
          </div>
          <button type="button" className="iconbtn dlg-x" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {children && <div className="dlg-body">{children}</div>}
        {footer && <div className="dlg-foot">{footer}</div>}
      </div>
    </dialog>
  );
}
