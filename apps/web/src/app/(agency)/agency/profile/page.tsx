"use client";

import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { DetailList } from "@/components/ui/DetailList";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { useActiveMembership, useSwitchAgency } from "@/features/agency/queries";
import { useLogout } from "@/features/auth/use-logout";
import { agencyColor, initials } from "@/lib/format";
import { useSessionStore } from "@/stores/session";

const ROLE_LABEL = { owner: "Owner", manager: "Manager", viewer: "Viewer (read-only)" } as const;

/** Real data only: the active agency + memberships from the session (no agency-details endpoint exists yet). Raw agency IDs are never shown. */
export default function AgencyProfilePage() {
  const user = useSessionStore((s) => s.user);
  const agencies = useSessionStore((s) => s.agencies);
  const { membership } = useActiveMembership();
  const switchAgency = useSwitchAgency();
  const { signOut, pending } = useLogout();
  const activeIndex = agencies.findIndex((a) => a.agencyId === membership?.agencyId);

  return (
    <>
      <PageHeader title="Agency profile" description={<>Signed in as {user?.email ?? user?.name}.</>} />
      <div className="ag-prof">
        <section className="card ag-prof-card" aria-labelledby="ag-prof-active">
          <h2 id="ag-prof-active">Active agency details</h2>
          {membership && (
            <>
              <div className="row">
                <span className="ag-tile" style={{ background: agencyColor(Math.max(activeIndex, 0)) }} aria-hidden="true">
                  {initials(membership.name)}
                </span>
                <b>{membership.name}</b>
              </div>
              <DetailList
                items={[
                  { label: "Your role", value: <Badge variant="verified">{ROLE_LABEL[membership.role]}</Badge>, icon: "shield" },
                ]}
              />
            </>
          )}
          {membership?.role === "viewer" && <p className="hint">You can see this agency&apos;s shifts. Owners and managers post and change them.</p>}
        </section>
        <section className="card ag-prof-card" aria-labelledby="ag-prof-list">
          <div className="ag-prof-head">
            <h2 id="ag-prof-list">Your agencies</h2>
            <Badge>{agencies.length} connected</Badge>
          </div>
          <ul className="ag-list">
            {agencies.map((a, index) => {
              const current = a.agencyId === membership?.agencyId;
              return (
                <li key={a.agencyId}>
                  <span className="ag-tile" style={{ background: agencyColor(index) }} aria-hidden="true">
                    {initials(a.name)}
                  </span>
                  <span className="grow">
                    <b>{a.name}</b>
                    <span className="ag-opt-role">{ROLE_LABEL[a.role]}</span>
                  </span>
                  {current ? (
                    <Badge variant="verified">
                      <Icon name="check" />
                      Current
                    </Badge>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => switchAgency(a.agencyId)} aria-label={`Switch to ${a.name}`}>
                      Switch
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <div className="ag-prof-foot">
        <Button variant="secondary" onClick={() => void signOut()} disabled={pending}>
          <Icon name="logout" />
          Sign out
        </Button>
      </div>
    </>
  );
}
