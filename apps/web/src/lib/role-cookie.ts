import { isRole, type Role } from "@/lib/routes";

/**
 * Non-sensitive routing hint read by `src/proxy.ts` (UX only: avoids a flash of the wrong area).
 * It holds NO credential. The API is the security boundary: a forged cookie only opens an empty shell.
 */
export const ROLE_COOKIE = "sp_role";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // same horizon as the refresh token

export function setRoleCookie(role: Role): void {
  if (typeof document === "undefined") return;
  document.cookie = `${ROLE_COOKIE}=${role}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function clearRoleCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${ROLE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function readRoleCookie(): Role | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${ROLE_COOKIE}=`));
  const value = match?.slice(ROLE_COOKIE.length + 1);
  return isRole(value) ? value : null;
}
