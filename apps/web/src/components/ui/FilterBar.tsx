"use client";

import type { ReactNode } from "react";
import { ChipGroup, type ChipOption } from "./ChipGroup";

/** Wrapper for labelled filter groups; `trailing` = search box or clear button. Filters are server-side: onChange updates query params. */
export function FilterBar({ label = "Filters", children, trailing }: { label?: string; children: ReactNode; trailing?: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="fbar">
      <div className="fbar-groups">{children}</div>
      {trailing && <div className="fbar-trail">{trailing}</div>}
    </div>
  );
}

/** One captioned chip group. Zero-count chips are dimmed (see ChipGroup) but still operable. */
export function FilterGroup<T extends string>({ label, options, value, onChange }: { label: string; options: ChipOption<T>[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="fgroup">
      <span className="fgroup-l" aria-hidden="true">
        {label}
      </span>
      <ChipGroup label={label} options={options} value={value} onChange={onChange} />
    </div>
  );
}
