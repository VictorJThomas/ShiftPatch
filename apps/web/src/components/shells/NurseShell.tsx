"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { useLogout } from "@/features/auth/use-logout";
import { initials } from "@/lib/format";
import { useSessionStore } from "@/stores/session";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/nurse/shifts", label: "Shifts", icon: "brief" },
  { href: "/nurse/my-shifts", label: "My shifts", icon: "list" },
  { href: "/nurse/credentials", label: "Credentials", icon: "idcard" },
  { href: "/nurse/profile", label: "Profile", icon: "user" },
];

/**
 * Nurse shell (design: Nurse-Scale-Up): bottom tab bar below 1000px, 232px left rail at ≥1000px.
 * Pages render their own `AppBar` (h1) + `.body` inside the shell's single `<main id="main">`.
 * Rail and tab bar share the label "Main": CSS shows exactly one of them, so only one is ever exposed.
 */
export function NurseShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const user = useSessionStore((s) => s.user);
  const { signOut, pending } = useLogout();
  const isOn = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <div className="nurse-shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <nav className="nurse-rail" aria-label="Main">
        <Logo />
        {TABS.map((tab) => (
          <Link key={tab.href} href={tab.href} className={`navi${isOn(tab.href) ? " on" : ""}`} aria-current={isOn(tab.href) ? "page" : undefined}>
            <Icon name={tab.icon} />
            {tab.label}
          </Link>
        ))}
        <div className="rail-user">
          <span className="avatar" aria-hidden="true">
            {initials(user?.name ?? "")}
          </span>
          <div className="who">
            <b>{user?.name}</b>
            <span>Nurse</span>
          </div>
          <button type="button" className="iconbtn" aria-label="Sign out" onClick={() => void signOut()} disabled={pending}>
            <Icon name="logout" />
          </button>
        </div>
      </nav>
      <main id="main" tabIndex={-1} className="nurse-main">
        {children}
      </main>
      <nav className="tabbar nurse-tabs" aria-label="Main">
        {TABS.map((tab) => (
          <Link key={tab.href} href={tab.href} className={`tab${isOn(tab.href) ? " on" : ""}`} aria-current={isOn(tab.href) ? "page" : undefined}>
            <Icon name={tab.icon} size="lg" />
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Signed-in nurse's initials, labelled with their name (for the AppBar's right slot). */
export function UserAvatar() {
  const name = useSessionStore((s) => s.user?.name ?? "");
  return (
    <span className="avatar" aria-label={name} role="img">
      {initials(name)}
    </span>
  );
}

/** Sticky page bar with the page's h1 and an optional right-hand slot. */
export function AppBar({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="appbar">
      <h1>{title}</h1>
      {children}
    </header>
  );
}
