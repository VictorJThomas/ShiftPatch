"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { HOME_BY_ROLE, LOGIN_PATH } from "@/lib/routes";
import { useSessionStore } from "@/stores/session";

/** `/` has no UI of its own: it sends the visitor to their role's home (or /login). The proxy handles the cookie case earlier. */
export default function Home() {
  const router = useRouter();
  const status = useSessionStore((s) => s.status);
  const role = useSessionStore((s) => s.user?.role);

  useEffect(() => {
    if (status === "anonymous") router.replace(LOGIN_PATH);
    else if (status === "authenticated" && role) router.replace(HOME_BY_ROLE[role]);
  }, [status, role, router]);

  return (
    <div className="page-loading" role="status" aria-busy="true">
      <span className="spin" aria-hidden="true" />
      Loading…
    </div>
  );
}
