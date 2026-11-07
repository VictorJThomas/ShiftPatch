"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { LOGIN_PATH } from "@/lib/routes";
import { logout } from "./session-flow";

/** `POST /api/auth/logout`, then clear store + role cookie + query cache and go to /login, even if the request fails. */
export function useLogout() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const signOut = useCallback(async () => {
    setPending(true);
    await logout();
    router.replace(LOGIN_PATH);
    setPending(false);
  }, [router]);
  return { signOut, pending };
}
