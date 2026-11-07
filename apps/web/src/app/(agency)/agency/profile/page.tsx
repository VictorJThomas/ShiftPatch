"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { useLogout } from "@/features/auth/use-logout";
import { useSessionStore } from "@/stores/session";

export default function AgencyProfilePage() {
  const user = useSessionStore((s) => s.user);
  const { signOut, pending } = useLogout();
  return (
    <>
      <div>
        <h1 className="page-h">Agency profile</h1>
        <p className="muted" style={{ fontSize: 14 }}>
          Signed in as {user?.email ?? user?.name}.
        </p>
      </div>
      <EmptyState icon="building" title="Profile details are coming">
        Facilities and contact details for this agency will live here.
      </EmptyState>
      <div>
        <button type="button" className="btn btn-secondary" onClick={() => void signOut()} disabled={pending}>
          <Icon name="logout" />
          Sign out
        </button>
      </div>
    </>
  );
}
