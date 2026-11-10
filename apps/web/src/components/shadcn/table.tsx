import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Same look as `.tbl`. The wrapper scrolls sideways on phones (and is `relative`, so `.sr` text cannot escape it: QA D1). */
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table data-slot="table" className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}
export const TableHeader = (p: ComponentProps<"thead">) => <thead data-slot="table-header" {...p} />;
export const TableBody = ({ className, ...p }: ComponentProps<"tbody">) => <tbody data-slot="table-body" className={cn("[&_tr:last-child_td]:border-b-0", className)} {...p} />;
export const TableRow = ({ className, ...p }: ComponentProps<"tr">) => (
  <tr data-slot="table-row" className={cn("[&:hover_td]:bg-[color-mix(in_srgb,var(--c-brand-soft)_45%,transparent)]", className)} {...p} />
);
export const TableHead = ({ className, ...p }: ComponentProps<"th">) => (
  <th data-slot="table-head" className={cn("border-b border-border bg-muted px-4 py-2.5 text-left text-[12.5px] font-[650] whitespace-nowrap text-muted-foreground", className)} {...p} />
);
export const TableCell = ({ className, ...p }: ComponentProps<"td">) => <td data-slot="table-cell" className={cn("border-b border-border px-4 py-3 align-middle", className)} {...p} />;
