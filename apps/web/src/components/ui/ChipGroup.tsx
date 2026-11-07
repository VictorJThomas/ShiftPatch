"use client";

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Single-select filter chips (`<button aria-pressed>`), one scrollable row on phones. Also used for status tabs. */
export function ChipGroup<T extends string>({ label, options, value, onChange }: { label: string; options: ChipOption<T>[]; value: T; onChange: (value: T) => void }) {
  return (
    <div role="group" aria-label={label} className="chips">
      {options.map((o) => (
        <button key={o.value} type="button" className={`chip${o.value === value ? " on" : ""}`} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
          {/* The space keeps the accessible name "Open 3", not "Open3"; flex gap ignores it visually. */}
          {o.count !== undefined && " "}
          {o.count !== undefined && <span className="chip-n tnum">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
