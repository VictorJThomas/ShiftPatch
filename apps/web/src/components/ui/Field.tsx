"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { Icon } from "./Icon";

/** Props a `Field` hands to its control. Spread them on a native `<input>`/`<textarea>` or on `Select`. */
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
    <div className="fld">
      <label className="lbl" htmlFor={id}>
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
        <p id={hintId} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="errmsg">
          <Icon name="alert-circle" size="sm" />
          {error}
        </p>
      )}
    </div>
  );
}

/** Native `<select>` styled as `.inp` with a chevron. `className` goes on the wrapper (pass Field's), the rest on `<select>`. */
export function Select({ className = "inp", children, ...props }: ComponentProps<"select">) {
  return (
    <div className={`${className} inp-select`}>
      <select {...props}>{children}</select>
      <Icon name="down" className="muted" />
    </div>
  );
}
