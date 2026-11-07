"use client";

import { AppBar } from "@/components/shells/NurseShell";
import { Icon } from "@/components/ui/Icon";
import { useLogout } from "@/features/auth/use-logout";
import { initials } from "@/lib/format";
import { useSessionStore } from "@/stores/session";

export default function NurseProfilePage() {
  const user = useSessionStore((s) => s.user);
  const { signOut, pending } = useLogout();
  return (
    <>
      <AppBar title="Profile" />
      <div className="body col" style={{ gap: 16 }}>
        <div className="card" style={{ padding: 20, display: "flex", gap: 16, alignItems: "center" }}>
          <span className="avatar avatar-lg" aria-hidden="true">
            {initials(user?.name ?? "")}
          </span>
          <div className="col" style={{ gap: 4, minWidth: 0 }}>
            <b style={{ fontSize: 20, letterSpacing: "-.01em" }}>{user?.name}</b>
            <span className="muted" style={{ fontSize: 14, overflowWrap: "anywhere" }}>
              {user?.email}
            </span>
          </div>
        </div>
        <div className="card">
          <button type="button" className="li" onClick={() => void signOut()} disabled={pending}>
            <Icon name="logout" />
            <span style={{ flex: 1 }}>Sign out</span>
          </button>
        </div>
      </div>
    </>
  );
}
