import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Replaces `.alert .al-ok|al-err|al-warn|al-info`. Pass the `role` yourself (status / alert); icon + text, never colour alone. */
export const alertVariants = cva("flex items-start gap-3 rounded-md border-[1.5px] px-4 py-3.5 text-[15px] leading-snug [&_.ic]:mt-px [&_b]:block [&_b]:font-bold", {
  variants: {
    variant: {
      info: "border-[var(--st-open-fg)] bg-[var(--st-open-bg)] text-[var(--st-open-fg)]",
      success: "border-[var(--st-filled-fg)] bg-[var(--st-filled-bg)] text-[var(--st-filled-fg)]",
      warning: "border-[var(--st-pending-fg)] bg-[var(--st-pending-bg)] text-[var(--st-pending-fg)]",
      destructive: "border-[var(--st-rejected-fg)] bg-[var(--st-rejected-bg)] text-[var(--st-rejected-fg)]",
    },
  },
  defaultVariants: { variant: "info" },
});

export function Alert({ className, variant, ...props }: ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}
