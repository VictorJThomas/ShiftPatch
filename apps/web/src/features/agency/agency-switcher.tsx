"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { agencyColor, initials } from "@/lib/format";
import { useSessionStore } from "@/stores/session";

/** Only rendered with more than one membership. Selecting never assumes access: the API still checks every request. */
export function AgencySwitcher() {
  const queryClient = useQueryClient();
  const agencies = useSessionStore((s) => s.agencies);
  const activeId = useSessionStore((s) => s.activeAgencyId);
  const setActiveAgency = useSessionStore((s) => s.setActiveAgency);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (agencies.length < 2) return null;

  const choose = (id: string) => {
    setOpen(false);
    triggerRef.current?.focus();
    if (id === activeId) return;
    const previous = activeId;
    setActiveAgency(id); // subsequent requests carry the new X-Agency-Id
    if (previous) queryClient.removeQueries({ queryKey: ["agency", previous] });
    void queryClient.invalidateQueries({ queryKey: ["agency"] });
  };

  return (
    <div className="ag-switch" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-band"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="swap" />
        Switch agency
        <Icon name="down" className={open ? "flip" : ""} />
      </button>
      {open && (
        <div className="card ag-menu">
          <div className="cap" id={`${listId}-label`}>
            Your agencies · {agencies.length}
          </div>
          <div role="listbox" id={listId} aria-labelledby={`${listId}-label`} className="col" style={{ gap: 4 }}>
            {agencies.map((agency, index) => {
              const selected = agency.agencyId === activeId;
              return (
                <button
                  key={agency.agencyId}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className="ag-opt"
                  autoFocus={selected}
                  onClick={() => choose(agency.agencyId)}
                >
                  <span className="ag-tile" style={{ background: agencyColor(index) }} aria-hidden="true">
                    {initials(agency.name)}
                  </span>
                  <span style={{ flex: 1, fontWeight: 700 }}>{agency.name}</span>
                  {selected ? (
                    <span className="badge b-verified">
                      <Icon name="check" />
                      Current
                    </span>
                  ) : (
                    <span className="btn btn-secondary btn-sm" aria-hidden="true">
                      Switch
                    </span>
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
