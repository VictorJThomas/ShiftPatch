"use client";

import Link from "next/link";
import { useCallback } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/shadcn/dropdown-menu";
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

// Radix focuses the menu container when a pointer opens it; the contract is "opening lands on the first item". The ref is
// stable (useCallback), so it runs once per mount; the timeout lets Radix's own focus run first.
const useFocusFirstItem = () =>
  useCallback((node: HTMLDivElement | null) => {
    if (node) setTimeout(() => node.querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled])')?.focus(), 0);
  }, []);

/**
 * Avatar button + dropdown (Profile link, Sign out) on Shadcn DropdownMenu (Radix): Esc closes and returns focus to the
 * trigger, outside click closes, arrows/Home/End move between items, Tab closes, Enter/Space activate. The menu is
 * positioned by Radix (flips and shifts to stay inside the viewport). Opening always focuses the first item.
 */
export function AccountMenu({ profileHref, placement = "below", detail, links }: AccountMenuProps) {
  const name = useSessionStore((s) => s.user?.name ?? "");
  const { signOut, pending } = useLogout();
  const focusFirstItem = useFocusFirstItem();

  return (
    <div className={`acct${detail ? " acct-wide" : ""}`}>
      {/* modal={false}: no scroll lock or inert page for a small menu; outside click still closes it. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="acct-btn" aria-label="Account menu">
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
        </DropdownMenuTrigger>
        <DropdownMenuContent
          loop
          aria-label="Account"
          side={placement === "above" ? "top" : "bottom"}
          align={detail ? "start" : "end"}
          ref={focusFirstItem}
        >
          {links?.map((l) => (
            <DropdownMenuItem key={l.href} asChild>
              <Link href={l.href}>
                <Icon name={l.icon} />
                {l.label}
              </Link>
            </DropdownMenuItem>
          ))}
          {profileHref && (
            <DropdownMenuItem asChild>
              <Link href={profileHref}>
                <Icon name="user" />
                Profile
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem tone="danger" disabled={pending} onSelect={() => void signOut()}>
            <Icon name="logout" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
