"use client";

import type { ReactNode } from "react";
import { AppDialog, type AppDialogProps, type AppDialogSize } from "./AppDialog";

export interface DialogProps extends Omit<AppDialogProps, "size"> {
  /** @deprecated Use `size`. sheet/modal -> md, panel -> lg. */
  variant?: "sheet" | "modal" | "panel";
  size?: AppDialogSize;
}

/**
 * Compatibility wrapper: delegates to `AppDialog` (Shadcn/Radix). New code imports `AppDialog` and passes `size`.
 * The previous native `<dialog>` implementation is kept for reference in `_legacy/NativeDialog.tsx.txt`.
 */
export function Dialog({ variant, size, ...props }: DialogProps & { children?: ReactNode }) {
  return <AppDialog {...props} size={size ?? (variant === "panel" ? "lg" : "md")} />;
}
