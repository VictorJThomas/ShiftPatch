"use client";

import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { useActiveMembership, useSwitchAgency } from "@/features/agency/queries";
import { useLogout } from "@/features/auth/use-logout";
import { agencyColor, initials } from "@/lib/format";
import { useSessionStore } from "@/stores/session";

const ROLE_LABEL = { owner: "Owner", manager: "Manager", viewer: "Viewer (read-only)" } as const;

/** Real data only: the active agency + memberships from the session (no agency-details endpoint exists yet). */
export default function AgencyProfilePage() {
  const user = useSessionStore((s) => s.user);
  const agencies = useSessionStore((s) => s.agencies);
  const { membership } = useActiveMembership();
  const switchAgency = useSwitchAgency();
  const { signOut, pending } = useLogout();

  return (
    <>
      <PageHeader title="Agency profile" description={<>Signed in as {user?.email ?? user?.name}.</>} />
      <div className="ag-prof">
        <section className="card ag-prof-card" aria-labelledby="ag-prof-active">
          <h2 id="ag-prof-active">Active agency</h2>
          {membership && (
            <dl className="ag-dl">
              <dt>Name</dt>
              <dd>{membership.name}</dd>
              <dt>Agency ID</dt>
              <dd className="tnum">{membership.agencyId}</dd>
              <dt>Your role</dt>
              <dd>{ROLE_LABEL[membership.role]}</dd>
            </dl>
          )}
          {membership?.role === "viewer" && <p className="hint">You can see this agency&apos;s shifts. Owners and managers post and change them.</p>}
        </section>
        <section className="card ag-prof-card" aria-labelledby="ag-prof-list">
          <h2 id="ag-prof-list">Your agencies · {agencies.length}</h2>
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
                    <span className="badge b-verified">
                      <Icon name="check" />
                      Current
                    </span>
                  ) : (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => switchAgency(a.agencyId)} aria-label={`Switch to ${a.name}`}>
                      Switch
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <div>
        <button type="button" className="btn btn-secondary" onClick={() => void signOut()} disabled={pending}>
          <Icon name="logout" />
          Sign out
        </button>
      </div>
    </>
  );
}
