"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AccountMenu } from "@/components/ui/AccountMenu";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { useSessionStore } from "@/stores/session";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/admin/users", label: "Users", icon: "user" },
  { href: "/admin/audit", label: "Audit log", icon: "file" },
  { href: "/admin/timesheets", label: "Timesheets", icon: "clock" },
];

/** Admin shell: 248px left sidebar at ≥960px; below that a top bar (logo + sign out, scrollable nav row). Content max 1440px. */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const user = useSessionStore((s) => s.user);
  return (
    <div className="adm">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className="adm-side" aria-label="Hospital admin">
        <Logo />
        <div className="tag adm-tag">
          <Icon name="building" />
          Hospital network
        </div>
        <nav aria-label="Admin" className="adm-nav">
          {NAV.map((item) => {
            const on = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={`navi${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
                <Icon name={item.icon} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="rail-user">
          <AccountMenu placement="above" detail={{ name: user?.name ?? "", caption: "Hospital admin" }} />
        </div>
      </aside>
      <main id="main" tabIndex={-1} className="adm-main">
        {children}
      </main>
    </div>
  );
}
