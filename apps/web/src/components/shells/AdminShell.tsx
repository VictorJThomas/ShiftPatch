"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { useLogout } from "@/features/auth/use-logout";
import { initials } from "@/lib/format";
import { useSessionStore } from "@/stores/session";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/admin/audit", label: "Audit log", icon: "file" },
  { href: "/admin/timesheets", label: "Timesheets", icon: "clock" },
];

/** Desktop admin shell: left sidebar (collapses above the content on narrow screens). */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const user = useSessionStore((s) => s.user);
  const { signOut, pending } = useLogout();
  return (
    <div className="adm">
      <aside className="adm-side" aria-label="Hospital admin">
        <div style={{ padding: "4px 8px" }}>
          <Logo />
        </div>
        <div className="tag" style={{ alignSelf: "flex-start", margin: "4px 8px 16px" }}>
          <Icon name="building" />
          Hospital network
        </div>
        <nav aria-label="Admin" className="col" style={{ gap: 6 }}>
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
        <div className="row" style={{ marginTop: "auto", borderTop: "1px solid var(--c-line)", paddingTop: 14 }}>
          <span className="avatar" aria-hidden="true">
            {initials(user?.name ?? "")}
          </span>
          <div className="col" style={{ flex: 1, lineHeight: 1.25, minWidth: 0 }}>
            <b style={{ fontSize: 14 }}>{user?.name}</b>
            <span className="muted" style={{ fontSize: 12.5 }}>
              Hospital admin
            </span>
          </div>
          <button type="button" className="iconbtn" aria-label="Sign out" onClick={() => void signOut()} disabled={pending}>
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <main className="adm-main">{children}</main>
    </div>
  );
}
