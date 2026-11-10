"use client";

import type { ComponentProps } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay data-slot="dialog-overlay" className={cn("fixed inset-0 z-50 bg-scrim motion-safe:animate-[dlg-fade_.2s_ease-out]", className)} {...props} />;
}

/**
 * Centered box (`inset-0 m-auto h-fit`, no transform: the enter animation can use transform without fighting the centering).
 * No exit animation on purpose: Radix unmounts at once, so a test ID inside never exists twice and tests do not wait.
 * Use `AppDialog` instead of this for anything user-facing.
 */
export function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed inset-0 z-50 m-auto flex h-fit max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg flex-col overflow-hidden rounded-lg bg-card text-card-foreground shadow-lg motion-safe:animate-[dlg-in_.2s_cubic-bezier(.2,0,0,1)]",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export const DialogTitle = ({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) => (
  <DialogPrimitive.Title data-slot="dialog-title" className={cn("text-[22px] leading-tight font-[750] tracking-tight text-balance", className)} {...props} />
);
export const DialogDescription = ({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) => (
  <DialogPrimitive.Description data-slot="dialog-description" className={cn("mt-1.5 text-[15px] text-pretty text-[var(--c-ink-2)]", className)} {...props} />
);
