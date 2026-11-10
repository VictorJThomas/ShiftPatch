"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AccountMenu } from "@/components/ui/AccountMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import type { IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { AgencySwitcher } from "@/features/agency/agency-switcher";
import { agencyColor, initials } from "@/lib/format";
import { useSessionStore } from "@/stores/session";

const BASE_NAV: { href: string; label: string; short: string; icon: IconName }[] = [
  { href: "/agency/shifts", label: "Shifts", short: "Shifts", icon: "brief" },
  { href: "/agency/timesheets", label: "Timesheets", short: "Timesheets", icon: "clock" },
  { href: "/agency/profile", label: "Agency profile", short: "Agency profile", icon: "building" },
];
const INSPECTION_NAV = { href: "/agency/inspection", label: "Inspection", short: "Inspection", icon: "shield" } as const; // owners only


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
        {/* Below 720px the header is hidden: the account menu lives in the band instead. */}
        <div className="ag-band-acct">
          <AccountMenu profileHref="/agency/profile" links={[{ href: "/agency/shifts", label: "Shifts", icon: "brief" }, { href: "/agency/timesheets", label: "Timesheets", icon: "clock" }]} />
        </div>
      </div>
    </section>
  );
}

/** Agency shell: header + full-width "Active agency" band + switcher (>1 agency). Below 720 px: no header and no tab bar (one tab would be pointless); the band carries the account menu (Profile, Sign out). */
export function AgencyShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const user = useSessionStore((s) => s.user);
  const activeId = useSessionStore((s) => s.activeAgencyId);
  const agencyCount = useSessionStore((s) => s.agencies.length);
  const isOwner = useSessionStore((s) => s.agencies.find((a) => a.agencyId === s.activeAgencyId)?.role === "owner");
  const NAV = isOwner ? [...BASE_NAV, INSPECTION_NAV] : BASE_NAV;

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <a className="skip" href="#main">
        Skip to content
      </a>
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
            <span className="ag-email">{user?.email ?? user?.name}</span>
            <AccountMenu profileHref="/agency/profile" />
          </div>
        </div>
      </header>
      <AgencyBand />
      <main id="main" tabIndex={-1} className="ag-main">
        {activeId ? (
          children
        ) : (
          <EmptyState icon="building" title={agencyCount > 1 ? "Select an agency" : "No agency access"}>
            {agencyCount > 1 ? "Use Switch agency above to choose which agency you are working on." : "Your account is not linked to an agency yet. Ask an owner to add you."}
          </EmptyState>
        )}
      </main>
    </div>
  );
}
