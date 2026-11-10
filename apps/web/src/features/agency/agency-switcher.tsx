"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Icon } from "@/components/ui/Icon";
import { agencyColor, initials } from "@/lib/format";
import { useSessionStore } from "@/stores/session";
import { useSwitchAgency } from "./queries";

/**
 * Only rendered with more than one membership. Selecting never assumes access: the API still checks every request.
 * Keyboard: the trigger opens the list with focus on the current agency; ↑/↓/Home/End move, Enter/Space select,
 * Esc closes and returns focus to the trigger, Tab out closes.
 */
export function AgencySwitcher() {
  const agencies = useSessionStore((s) => s.agencies);
  const activeId = useSessionStore((s) => s.activeAgencyId);
  const switchAgency = useSwitchAgency();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onFocus = (e: FocusEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open]);

  if (agencies.length < 2) return null;

  const choose = (id: string) => {
    setOpen(false);
    triggerRef.current?.focus();
    switchAgency(id);
  };

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const options = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    const index = options.findIndex((o) => o === document.activeElement);
    const last = options.length - 1;
    const next = e.key === "ArrowDown" ? Math.min(index + 1, last) : e.key === "ArrowUp" ? Math.max(index - 1, 0) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    options[next]?.focus();
  };

  return (
    <div className="ag-switch" ref={rootRef}>
      <Button
        ref={triggerRef}
        variant="band"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon name="swap" />
        Switch agency
        <Icon name="down" className={open ? "flip" : ""} />
      </Button>
      {open && (
        <div className="card ag-menu">
          <div className="cap" id={`${listId}-label`}>
            Your agencies · {agencies.length}
          </div>
          <div ref={listRef} role="listbox" id={listId} aria-labelledby={`${listId}-label`} className="col" style={{ gap: 4 }} onKeyDown={onListKey}>
            {agencies.map((agency, index) => {
              const selected = agency.agencyId === activeId;
              return (
                <button
                  key={agency.agencyId}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className="ag-opt"
                  // Focus lands on the current agency, or the first one when none is selected yet.
                  autoFocus={selected || (!activeId && index === 0)}
                  tabIndex={selected || (!activeId && index === 0) ? 0 : -1}
                  onClick={() => choose(agency.agencyId)}
                >
                  <span className="ag-tile" style={{ background: agencyColor(index) }} aria-hidden="true">
                    {initials(agency.name)}
                  </span>
                  <span style={{ flex: 1, fontWeight: 700 }}>
                    {agency.name}
                    <span className="ag-opt-role">{agency.role}</span>
                  </span>
                  {selected ? (
                    <Badge variant="verified">
                      <Icon name="check" />
                      Current
                    </Badge>
                  ) : (
                    <Badge aria-hidden="true">Switch</Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
