"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { HOME_BY_ROLE, LOGIN_PATH, type Role } from "@/lib/routes";
import { useSessionStore } from "@/stores/session";

/**
 * Client-side guard for a role's area (UX only; the API is the security boundary).
 * Wrong role -> own home, anonymous -> /login, still restoring -> a busy placeholder.
 */
export function RoleGuard({ role, children }: { role: Role; children: ReactNode }) {
  const router = useRouter();
  const status = useSessionStore((s) => s.status);
  const userRole = useSessionStore((s) => s.user?.role);

  const target = status === "anonymous" ? LOGIN_PATH : status === "authenticated" && userRole && userRole !== role ? HOME_BY_ROLE[userRole] : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

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
