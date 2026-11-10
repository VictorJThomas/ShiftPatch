"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { AlertCircle, ChevronDown } from "lucide-react";
import { inputClass, stripLegacyInp } from "@/components/shadcn/input";
import { cn } from "@/lib/utils";

/**
 * Props a `Field` hands to its control. Spread them on `Input`/`Textarea` (`@/components/shadcn/*`) or on `Select`.
 * `className` is still the legacy "inp" / "inp err" so an unmigrated bare `<input {...p}>` keeps its look; the Shadcn
 * controls drop those tokens and style themselves from `aria-invalid`.
 */
export interface FieldControlProps {
  id: string;
  className: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  required?: boolean;
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  /** Render prop: `{(p) => <input {...p} {...register("date")} type="date" />}`. */
  children: (control: FieldControlProps) => ReactNode;
}

/** Label + control + hint + error, wired with `id`, `aria-describedby` and `aria-invalid`. Error shows an icon, not colour alone. */
export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : "";
  const errId = error ? `${id}-err` : "";
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-sm font-[650] [&_small]:font-medium [&_small]:text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      {children({
        id,
        className: error ? "inp err" : "inp",
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        required,
      })}
      {hint && (
        <p id={hintId} className="mt-1.5 text-[13px] text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-destructive">
          <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Native `<select>` (kept on purpose: the OS picker is the best control on phones) styled like `Input`, with a chevron.
 * `className` goes on the wrapper (Field's legacy "inp" token is dropped); everything else, `ref` included, on `<select>`.
 */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className={cn("relative", stripLegacyInp(className))}>
      <select data-slot="select" {...props} className={cn(inputClass, "appearance-none pr-10")}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
