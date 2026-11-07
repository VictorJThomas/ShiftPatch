"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { initials } from "@/lib/format";
import { useSessionStore } from "@/stores/session";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/nurse/shifts", label: "Shifts", icon: "brief" },
  { href: "/nurse/my-shifts", label: "My shifts", icon: "list" },
  { href: "/nurse/credentials", label: "Credentials", icon: "idcard" },
  { href: "/nurse/profile", label: "Profile", icon: "user" },
];

/** Mobile-first nurse shell: phone-width column, 4-tab bottom bar. Pages render their own `AppBar`. */
export function NurseShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="nurse-shell">
      {children}
      <nav className="tabbar" aria-label="Main">
        {TABS.map((tab) => {
          const on = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link key={tab.href} href={tab.href} className={`tab${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
              <Icon name={tab.icon} size="lg" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function UserAvatar() {
  const name = useSessionStore((s) => s.user?.name ?? "");
  return (
    <span className="avatar" aria-label={name} role="img">
      {initials(name)}
    </span>
  );
}

export function AppBar({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="appbar">
      <h1>{title}</h1>
      {children}
    </header>
  );
}
