import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Same look as the legacy `.btn` family (tokens, 44px tap target, 1.5px border). Focus ring comes from the global
 * `:focus-visible` rule in globals.css; pointer/not-allowed cursors from the global button rules.
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border-[1.5px] border-transparent bg-transparent text-[15px] leading-none font-[650] no-underline transition-colors disabled:opacity-55 aria-disabled:opacity-55",
  {
    variants: {
      variant: {
        /** .btn-primary */
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        /** .btn-secondary */
        secondary: "border-input bg-secondary text-secondary-foreground hover:bg-muted",
        /** .btn-ghost */
        ghost: "text-accent-foreground hover:bg-muted",
        /** .btn-danger (outlined) */
        danger: "border-destructive bg-card text-destructive hover:bg-destructive-soft",
        /** .btn-danger-solid */
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
        /** .btn-band (on the coloured agency band) */
        band: "border-white bg-white/15 text-white hover:bg-white/25 focus-visible:outline-white",
      },
      size: {
        default: "min-h-11 px-4",
        /** .btn-sm: compact (36px) only for a fine pointer on a wide screen; 44px tap target on touch / below 1024px. */
        sm: "min-h-11 rounded-sm px-3 text-sm lg:pointer-fine:min-h-9",
        /** .iconbtn */
        icon: "size-11 border-0 p-0",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "default", size: "default", block: false },
  },
);

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a Next `<Link>`) with the button styles. */
  asChild?: boolean;
  /** Spinner + `aria-busy` + disabled. */
  loading?: boolean;
}

/** `ref`, `data-testid` and every native attribute pass through (React 19: ref is a plain prop). */
export function Button({ className, variant, size, block, asChild = false, loading = false, disabled, type, children, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, block }), className);
  if (asChild)
    return (
      <Slot.Root data-slot="button" className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  return (
    <button data-slot="button" type={type ?? "button"} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <span className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
