"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import Link from "next/link";
import { AppBar, UserAvatar } from "@/components/shells/NurseShell";
import { Icon } from "@/components/ui/Icon";
import { useLogout } from "@/features/auth/use-logout";
import { initials } from "@/lib/format";
import { useSessionStore } from "@/stores/session";
import { useCredentials } from "./queries";

/** Name + email come from the session (restored via /api/me); license status from the credentials query. */
export function Profile() {
  const user = useSessionStore((s) => s.user);
  const creds = useCredentials();
  const { signOut, pending } = useLogout();
  const count = creds.data?.credentials.length;

  return (
    <>
      <AppBar title="Profile">
        <UserAvatar />
      </AppBar>
      <div className="body nurse-stack nurse-narrow">
        <section className="card nurse-profile" aria-label="Account">
          <span className="avatar avatar-lg" aria-hidden="true">
            {initials(user?.name ?? "")}
          </span>
          <div className="col nurse-profile-who">
            <h2>{user?.name}</h2>
            {user?.email && <span className="muted">{user.email}</span>}
            {creds.data &&
              (creds.data.licenseValid ? (
                <span className="badge b-verified">
                  <Icon name="shield" />
                  License valid
                </span>
              ) : (
                <span className="badge b-expired">
                  <Icon name="cal-x" />
                  No valid license
                </span>
              ))}
          </div>
        </section>
        <div className="card">
          <div className="li">
            <Icon name="user" />
            <span className="nurse-grow">Role</span>
            <span className="muted">Nurse</span>
          </div>
          <Link className="li" href="/nurse/credentials">
            <Icon name="idcard" />
            <span className="nurse-grow">Credentials</span>
            {count !== undefined && <span className="muted tnum">{count} on file</span>}
            <Icon name="right" size="sm" className="muted" />
          </Link>
          <Link className="li" href="/nurse/my-shifts">
            <Icon name="list" />
            <span className="nurse-grow">My shifts</span>
            <Icon name="right" size="sm" className="muted" />
          </Link>
        </div>
        <div className="card">
          <button type="button" className="li" onClick={() => void signOut()} disabled={pending}>
            <Icon name="logout" />
            <span className="nurse-grow">Sign out</span>
          </button>
        </div>
      </div>
    </>
  );
}
