"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AccountMenu } from "@/components/ui/AccountMenu";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { useSessionStore } from "@/stores/session";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/nurse/shifts", label: "Shifts", icon: "brief" },
  { href: "/nurse/my-shifts", label: "My shifts", icon: "list" },
  { href: "/nurse/credentials", label: "Credentials", icon: "idcard" },
  { href: "/nurse/profile", label: "Profile", icon: "user" },
];
/** Mobile tab bar: Profile lives in the avatar menu (top right) instead. */
const MOBILE_TABS = TABS.filter((t) => t.href !== "/nurse/profile");

/**
 * Nurse shell (design: Nurse-Scale-Up): bottom tab bar below 1000px, 232px left rail at ≥1000px.
 * Pages render their own `AppBar` (h1) + `.body` inside the shell's single `<main id="main">`.
 * Rail and tab bar share the label "Main": CSS shows exactly one of them, so only one is ever exposed.
 */
export function NurseShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const user = useSessionStore((s) => s.user);
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
          <AccountMenu profileHref="/nurse/profile" placement="above" detail={{ name: user?.name ?? "", caption: "Nurse" }} />
        </div>
      </nav>
      <main id="main" tabIndex={-1} className="nurse-main">
        {children}
      </main>
      <nav className="tabbar nurse-tabs" aria-label="Main">
        {MOBILE_TABS.map((tab) => (
          <Link key={tab.href} href={tab.href} className={`tab${isOn(tab.href) ? " on" : ""}`} aria-current={isOn(tab.href) ? "page" : undefined}>
            <Icon name={tab.icon} size="lg" />
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Top-right avatar of the AppBar: the account menu (Profile, Sign out). Hidden >=1000px, where the rail has one. */
export function UserAvatar() {
  return (
    <div className="appbar-acct">
      <AccountMenu profileHref="/nurse/profile" />
    </div>
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
