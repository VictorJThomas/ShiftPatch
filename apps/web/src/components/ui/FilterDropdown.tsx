"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { Separator } from "@/components/shadcn/separator";
import { cn } from "@/lib/utils";

export interface FilterDropdownProps {
  /** Trigger text and the panel's accessible name, e.g. "Filters". */
  label: string;
  /** How many filters are applied; shown as a badge and read out in the trigger's accessible name. */
  activeCount: number;
  /**
   * Confirm mode: an Apply button is shown; it calls this and closes the panel. Omit for immediate filters
   * (the children change the query as the user clicks; there is no Apply button).
   */
  onApply?: () => void;
  /** Clear all filters. Does not close the panel. */
  onReset: () => void;
  /** The filter controls. The parent owns all filter state; this component knows nothing about what is filtered. */
  children: ReactNode;
  /** Fires when the panel opens or closes (Esc, outside click, Apply). Use it to discard an unapplied draft on close. */
  onOpenChange?: (open: boolean) => void;
  applyLabel?: string;
  resetLabel?: string;
  className?: string;
  testId?: string;
}

/**
 * Trigger button + anchored panel (Radix Popover): opens with click, Enter or Space, Esc closes and returns focus to the
 * trigger, Tab stays inside the panel. The panel is capped to the space the viewport leaves (width and height), so it
 * fits a 360px phone and scrolls its body instead of overflowing; header-less, footer pinned.
 */
export function FilterDropdown({ label, activeCount, onApply, onReset, children, onOpenChange, applyLabel = "Apply", resetLabel = "Reset", className, testId }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const change = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  return (
    <Popover open={open} onOpenChange={change}>
      <PopoverTrigger asChild>
        <Button variant="secondary" className={cn("min-w-0", className)} data-testid={testId} aria-label={activeCount > 0 ? `${label}, ${activeCount} active` : undefined}>
          <SlidersHorizontal aria-hidden="true" className="size-[18px]" />
          {label}
          {activeCount > 0 && (
            <Badge variant="count" aria-hidden="true">
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label={label} className="filter-panel w-[min(24rem,var(--radix-popover-content-available-width))]">
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-4">{children}</div>
        <Separator />
        <div className="flex shrink-0 items-center justify-between gap-3 p-3">
          <Button variant="ghost" size="sm" onClick={onReset} disabled={activeCount === 0 && !onApply}>
            {resetLabel}
          </Button>
          {onApply && (
            <Button
              size="sm"
              onClick={() => {
                onApply();
                change(false);
              }}
            >
              {applyLabel}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
