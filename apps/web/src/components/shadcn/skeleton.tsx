import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Shimmer placeholder (keyframes `sk` live in tokens.css; static under prefers-reduced-motion). */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-[sk_1.4s_linear_infinite] rounded-sm bg-[linear-gradient(90deg,var(--c-sunken)_0%,var(--c-line)_50%,var(--c-sunken)_100%)] bg-[length:200%_100%] motion-reduce:animate-none", className)}
      {...props}
    />
  );
}
