"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/shadcn/button";
import { HOME_BY_ROLE, LOGIN_PATH, type Role } from "@/lib/routes";
import { useSessionStore } from "@/stores/session";
import { retrySession } from "./session-flow";

/** Throttled or API unreachable at start-up: still signed in, so offer a retry instead of the login page. */
export function SessionUnavailable() {
  return (
    <div className="page-loading" role="alert">
      <span>We couldn&apos;t reach your session. You are still signed in.</span>
      <Button variant="secondary" onClick={() => void retrySession()}>
        Try again
      </Button>
      <a href={LOGIN_PATH}>Sign in again</a>
    </div>
  );
}

/**
 * Client-side guard for a role's area (UX only; the API is the security boundary).
 * Wrong role -> own home, anonymous -> /login, still restoring -> a busy placeholder,
 * unavailable (restore throttled / API down) -> "Try again", never /login.
 */
export function RoleGuard({ role, children }: { role: Role; children: ReactNode }) {
  const router = useRouter();
  const status = useSessionStore((s) => s.status);
  const userRole = useSessionStore((s) => s.user?.role);

  const target = status === "anonymous" ? LOGIN_PATH : status === "authenticated" && userRole && userRole !== role ? HOME_BY_ROLE[userRole] : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (status === "unavailable") return <SessionUnavailable />;
  if (status !== "authenticated" || userRole !== role) {
    return (
      <div className="page-loading" role="status" aria-busy="true">
        <span className="spin" aria-hidden="true" />
        Loading your session…
      </div>
    );
  }
  return <>{children}</>;
}
