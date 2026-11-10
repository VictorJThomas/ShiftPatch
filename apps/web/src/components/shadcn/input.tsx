import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Same box as the legacy `.inp`: 48px, 1.5px strong border, 16px text. `aria-invalid` (set by Field) switches to the error style. */
export const inputClass =
  "block min-h-12 w-full min-w-0 rounded-md border-[1.5px] border-input bg-card px-3.5 text-base text-foreground placeholder:text-muted-foreground aria-invalid:border-2 aria-invalid:border-destructive disabled:opacity-55";

/**
 * Field's render prop still hands out the legacy `className="inp"` / `"inp err"`. Those tokens are dropped here so the
 * unlayered legacy `.inp` rules never double-style a Shadcn control. Remove once no screen spreads Field props on a bare element.
 */
export const stripLegacyInp = (className?: string) =>
  className
    ?.split(/\s+/)
    .filter((t) => t && t !== "inp" && t !== "err")
    .join(" ");

export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return <input data-slot="input" type={type} className={cn(inputClass, stripLegacyInp(className))} {...props} />;
}
