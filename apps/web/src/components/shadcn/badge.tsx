import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Pill with icon + label + tint. Status variants read the `--st-*` tokens (light and dark). */
export const badgeVariants = cva(
  "inline-flex min-h-7 items-center gap-1.5 rounded-full py-[3px] pr-[11px] pl-2 text-[13px] leading-tight font-[650] whitespace-nowrap shadow-[inset_0_0_0_1px_color-mix(in_srgb,currentColor_30%,transparent)] [&_.ic]:size-4 [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "bg-muted text-foreground",
        count: "min-h-0 min-w-[22px] justify-center rounded-full bg-primary px-1.5 py-px text-xs font-bold text-primary-foreground shadow-none",
        open: "bg-[var(--st-open-bg)] text-[var(--st-open-fg)]",
        filled: "bg-[var(--st-filled-bg)] text-[var(--st-filled-fg)]",
        cancelled: "bg-[var(--st-cancelled-bg)] text-[var(--st-cancelled-fg)]",
        completed: "bg-[var(--st-completed-bg)] text-[var(--st-completed-fg)]",
        pending: "bg-[var(--st-pending-bg)] text-[var(--st-pending-fg)]",
        verified: "bg-[var(--st-verified-bg)] text-[var(--st-verified-fg)]",
        rejected: "bg-[var(--st-rejected-bg)] text-[var(--st-rejected-fg)]",
        // Hatched + heavier ring so "expired" is not colour alone.
        expired:
          "bg-[var(--st-expired-bg)] bg-[repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_srgb,var(--st-expired-fg)_12%,transparent)_6px_7px)] text-[var(--st-expired-fg)] shadow-[inset_0_0_0_1.5px_var(--st-expired-fg)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({ className, variant, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
