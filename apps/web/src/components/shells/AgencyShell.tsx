"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { AgencySwitcher } from "@/features/agency/agency-switcher";
import { useLogout } from "@/features/auth/use-logout";
import { agencyColor, initials } from "@/lib/format";
import { useSessionStore } from "@/stores/session";

const NAV: { href: string; label: string; short: string; icon: IconName }[] = [
  { href: "/agency/shifts", label: "Shifts", short: "Shifts", icon: "brief" },
  { href: "/agency/profile", label: "Agency profile", short: "Agency profile", icon: "building" },
];

function AgencyBand() {
  const agencies = useSessionStore((s) => s.agencies);
  const activeId = useSessionStore((s) => s.activeAgencyId);
  const index = agencies.findIndex((a) => a.agencyId === activeId);
  const active = index >= 0 ? agencies[index] : undefined;
  const color = active ? agencyColor(index) : "#44514E";
  return (
    <section aria-label="Active agency" className="ag-band" style={{ background: color }}>
      <div className="ag-wrap">
        <span className="ag-mono" style={{ color }} aria-hidden="true">
          {active ? initials(active.name) : "?"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ag-eyebrow">Active agency</div>
          <div className="ag-name" data-testid="active-agency-name">
            {active ? active.name : agencies.length > 1 ? "Select an agency" : "No agency access"}
          </div>
        </div>
        <AgencySwitcher />
      </div>
    </section>
  );
}

/** Agency shell: header + full-width "Active agency" band + switcher (>1 agency). Below 720 px: bottom tab bar, no header. */
export function AgencyShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const user = useSessionStore((s) => s.user);
  const activeId = useSessionStore((s) => s.activeAgencyId);
  const agencyCount = useSessionStore((s) => s.agencies.length);
  const { signOut, pending } = useLogout();

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <header className="ag-header">
        <div className="ag-wrap">
          <Logo />
          <nav aria-label="Agency" className="ag-nav">
            {NAV.map((item) => {
              const on = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} className={`navi${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ag-user">
            <span className="avatar" aria-hidden="true">
              {initials(user?.name ?? "")}
            </span>
            <span>{user?.email ?? user?.name}</span>
            <button type="button" className="iconbtn" aria-label="Sign out" onClick={() => void signOut()} disabled={pending}>
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </header>
      <AgencyBand />
      <main className="ag-main">
        {activeId ? (
          children
        ) : (
          <EmptyState icon="building" title={agencyCount > 1 ? "Select an agency" : "No agency access"}>
            {agencyCount > 1 ? "Use Switch agency above to choose which agency you are working on." : "Your account is not linked to an agency yet. Ask an owner to add you."}
          </EmptyState>
        )}
      </main>
      <nav className="tabbar ag-tabbar" aria-label="Agency">
        {NAV.map((item) => {
          const on = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} className={`tab${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
              <Icon name={item.icon} size="lg" />
              {item.short}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
