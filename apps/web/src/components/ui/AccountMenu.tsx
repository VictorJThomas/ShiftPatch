"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useLogout } from "@/features/auth/use-logout";
import { initials } from "@/lib/format";
import { useSessionStore } from "@/stores/session";
import { Icon, type IconName } from "./Icon";

export interface AccountMenuProps {
  /** Omit to show Sign out only (admin has no profile page). */
  profileHref?: string;
  /** "above" opens upward (rail / sidebar footers). */
  placement?: "below" | "above";
  /** Name + caption next to the avatar (rail footers). */
  detail?: { name: string; caption: string };
  /** Extra link items shown before Profile (e.g. agency "Shifts" on phones, where no nav is visible). */
  links?: { href: string; label: string; icon: IconName }[];
}

/**
 * Avatar button + dropdown (Profile link, Sign out). Click-driven (never hover-only): Esc closes and returns
 * focus to the trigger, click outside closes, arrows/Home/End move between items, Tab closes.
 */
export function AccountMenu({ profileHref, placement = "below", detail, links }: AccountMenuProps) {
  const name = useSessionStore((s) => s.user?.name ?? "");
  const { signOut, pending } = useLogout();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const items = useCallback(() => Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []), []);
  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }, []);

  // Click / focus outside closes without stealing focus.
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [open]);

  // Focus the first item when the menu opens.
  useEffect(() => {
    if (open) items()[0]?.focus();
  }, [open, items]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === "ArrowDown" && !open && e.target === trigger.current) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open || e.target === trigger.current) return;
    // Links natively activate on Enter only; menu items also activate on Space.
    if (e.key === " " && e.target instanceof HTMLAnchorElement) {
      e.preventDefault();
      e.target.click();
      return;
    }
    const list = items();
    const i = list.indexOf(e.target as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      list[(n + list.length) % list.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={root} className={`acct${detail ? " acct-wide" : ""}`} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        className="acct-btn"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar" aria-hidden="true">
          {initials(name)}
        </span>
        {detail && (
          <span className="who">
            <b>{detail.name}</b>
            <span>{detail.caption}</span>
          </span>
        )}
        {detail && <Icon name="down" size="sm" className="muted" />}
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="Account" className={`acct-menu acct-${placement}`}>
          {links?.map((l) => (
            <Link key={l.href} href={l.href} role="menuitem" className="acct-item" tabIndex={-1} onClick={() => setOpen(false)}>
              <Icon name={l.icon} />
              {l.label}
            </Link>
          ))}
          {profileHref && (
            <Link href={profileHref} role="menuitem" className="acct-item" tabIndex={-1} onClick={() => setOpen(false)}>
              <Icon name="user" />
              Profile
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            className="acct-item acct-danger"
            tabIndex={-1}
            disabled={pending}
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
