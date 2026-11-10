"use client";

import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/shadcn/dialog";
import { cn } from "@/lib/utils";
import { dialogClosed, dialogOpened } from "@/stores/dialogs";
import { Toaster } from "./Toaster";

export type AppDialogSize = "sm" | "md" | "lg" | "xl" | "full";

export interface AppDialogProps {
  open: boolean;
  /** Called for Esc, overlay click and the X button (never while `blockClose`). The parent owns `open`. */
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Pinned under the scrolling body. Submit buttons for a form in `children`: `form="<form id>"`. */
  footer?: ReactNode;
  /** sm = confirmations (400) · md = details and short forms (520, default) · lg = long forms and tables (720) · xl = wide content (960) · full = full screen. */
  size?: AppDialogSize;
  /** Request in flight (upload, mutation): Esc, overlay click and X do nothing and X is disabled. */
  blockClose?: boolean;
  className?: string;
  testId?: string;
}

// Below 720px every size except `full` is a bottom sheet (92dvh max); lg and xl take nearly the full height there,
// because those hold long forms with the keyboard open. `full` ignores the breakpoint.
const SHEET = "max-[719px]:mx-0 max-[719px]:mt-auto max-[719px]:mb-0 max-[719px]:w-full max-[719px]:max-w-none max-[719px]:max-h-[92dvh] max-[719px]:rounded-t-xl max-[719px]:rounded-b-none";
const TALL = "max-[719px]:h-[calc(100dvh-1rem)] max-[719px]:max-h-[calc(100dvh-1rem)]";
const SIZES: Record<AppDialogSize, string> = {
  sm: `max-w-[400px] ${SHEET}`,
  md: `max-w-[520px] ${SHEET}`,
  lg: `max-w-[720px] ${SHEET} ${TALL}`,
  xl: `max-w-[960px] ${SHEET} ${TALL}`,
  full: "h-dvh max-h-dvh w-screen max-w-none rounded-none",
};

/**
 * Shared modal on Shadcn Dialog (Radix): focus trap, focus return, Esc, overlay close, aria-modal and scroll lock come from Radix.
 * Layout is a column: header and footer are pinned, only the body scrolls (`dvh` max height, so it is safe with a mobile
 * address bar or virtual keyboard; layout.tsx sets `interactiveWidget: resizes-content`).
 * Content mounts only while `open`, so a test ID inside never exists twice.
 *
 * Toasts: a modal makes the page behind it inert, so while open the page Toaster yields (stores/dialogs.ts) and the
 * dialog renders `<Toaster inline />` itself. Do not render a second Toaster inside children.
 */
export function AppDialog({ open, onClose, title, description, children, footer, size = "md", blockClose = false, className, testId }: AppDialogProps) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    dialogOpened(id);
    return () => dialogClosed(id);
  }, [open, id]);

  // Radix only restores focus to a `Dialog.Trigger`; this dialog is controlled and has none, so remember the opener.
  // A layout effect runs before Radix moves focus into the dialog (that happens in a passive effect).
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !blockClose && onClose()}>
      <DialogContent
        data-testid={testId}
        data-size={size}
        // Without a description Radix would point aria-describedby at an element that does not exist.
        {...(description ? {} : { "aria-describedby": undefined })}
        onEscapeKeyDown={(e) => blockClose && e.preventDefault()}
        onInteractOutside={(e) => blockClose && e.preventDefault()}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (opener.current?.isConnected) opener.current.focus();
        }}
        className={cn(SIZES[size], className)}
      >
        <Toaster inline dialogId={id} />
        {size !== "full" && <div className="mx-auto mt-2.5 mb-1.5 h-[5px] w-10 shrink-0 rounded-full bg-input/55 min-[720px]:hidden" aria-hidden="true" />}
        <div className="flex shrink-0 items-start gap-2 pt-3 pr-4 pl-6 max-[719px]:pt-1 min-[720px]:pt-5">
          <div className="min-w-0 flex-1 pt-2">
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" disabled={blockClose} onClick={onClose} className="-mt-0.5 text-foreground">
            <X aria-hidden="true" />
          </Button>
        </div>
        {children && <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-6 py-4 [overflow-wrap:anywhere]">{children}</div>}
        {footer && (
          <div className="appdlg-foot flex shrink-0 flex-wrap justify-end gap-3 border-t border-border px-6 py-4 max-[719px]:pb-[calc(1rem+env(safe-area-inset-bottom))]">{footer}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
