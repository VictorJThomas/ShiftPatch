"use client";

import type { ComponentProps } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

/** Collision-aware: width and height are capped to the room the viewport leaves (Radix `--radix-popover-content-available-*`). */
export function PopoverContent({ className, align = "start", sideOffset = 8, collisionPadding = 8, ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-50 flex max-h-[var(--radix-popover-content-available-height)] w-[min(22rem,var(--radix-popover-content-available-width))] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
