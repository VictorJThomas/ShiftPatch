"use client";

import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { dateRangeError, type DateRange } from "@/lib/date-range";
import { Field } from "./Field";

export interface DateRangeFilterProps {
  /** Group caption and accessible name (fieldset legend), e.g. "Date". */
  label: string;
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Earliest / latest selectable day (ISO), e.g. the first and last date that has data. */
  min?: string;
  max?: string;
}

/**
 * Start + End native date inputs (inclusive range, either side optional). Native on purpose: the OS picker is the best
 * control on phones and it is keyboard-typable on desktop. Each input bounds the other (`max` on Start, `min` on End);
 * a typed range that is still backwards gets an inline error on End (wired by `Field`) and the parent must not apply it.
 */
export function DateRangeFilter({ label, value, onChange, min, max }: DateRangeFilterProps) {
  const error = dateRangeError(value) ?? undefined;
  const set = (patch: Partial<DateRange>) => onChange({ ...value, ...patch });
  return (
    <fieldset className="m-0 flex min-w-0 flex-col border-0 p-0">
      <legend className="fgroup-l mb-1.5">{label}</legend>
      <div className="grid grid-cols-2 gap-3 [&>div]:mb-0">
        <Field label="Start date">{(p) => <Input {...p} type="date" value={value.from} min={min} max={value.to || max} onChange={(e) => set({ from: e.target.value })} />}</Field>
        <Field label="End date" error={error}>
          {(p) => <Input {...p} type="date" value={value.to} min={value.from || min} max={max} onChange={(e) => set({ to: e.target.value })} />}
        </Field>
      </div>
      {(value.from || value.to) && (
        <Button variant="ghost" size="sm" className="mt-1 self-start" onClick={() => onChange({ from: "", to: "" })}>
          Clear dates
        </Button>
      )}
    </fieldset>
  );
}
