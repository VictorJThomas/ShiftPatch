"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface SearchInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Debounce in ms (trailing). */
  delay?: number;
  className?: string;
  testId?: string;
}

/** Labelled search box. `onChange` fires after the user pauses typing; Esc clears immediately. */
export function SearchInput({ label, value, onChange, placeholder, delay = 300, className = "", testId }: SearchInputProps) {
  const id = useId();
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(onChange);
  latest.current = onChange;

  // Resync when the parent resets the value (e.g. "Clear filters").
  useEffect(() => setText(value), [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const push = (next: string, wait: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(next), wait);
  };

  return (
    <div className={`search ${className}`.trim()}>
      <label htmlFor={id} className="sr">
        {label}
      </label>
      <div className="inp">
        <Icon name="search" className="muted" />
        <input
          id={id}
          type="search"
          value={text}
          placeholder={placeholder ?? label}
          data-testid={testId}
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value);
            push(e.target.value, delay);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && text) {
              e.preventDefault();
              setText("");
              push("", 0);
            }
          }}
        />
      </div>
    </div>
  );
}
