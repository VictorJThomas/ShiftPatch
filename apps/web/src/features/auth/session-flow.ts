import { LoginResponse, MeResponse, type LoginRequest } from "@shiftpatch/contracts";
import { apiFetch, refreshSession } from "@/lib/api-client";
import { getQueryClient } from "@/lib/query-client";
import { clearRoleCookie, setRoleCookie } from "@/lib/role-cookie";
import { pickActiveAgency, useSessionStore } from "@/stores/session";

/** Drop everything session-shaped on this device: store, role cookie, cached server state. */
export function endSessionLocally(): void {
  useSessionStore.getState().clearSession();
  clearRoleCookie();
  getQueryClient().clear();
}

export const fetchMe = () => apiFetch("/api/me", { schema: MeResponse });

/** `/api/me` for the memberships, then commit the session (status -> authenticated). The token must already be in the store. */
async function commitSession(): Promise<void> {
  const me = await fetchMe();
  const { accessToken, activeAgencyId } = useSessionStore.getState();
  if (!accessToken) throw new Error("No access token"); // cleared meanwhile (logout / expiry)
  const agencies = me.agencies.map(({ agencyId, name, role }) => ({ agencyId, name, role }));
  useSessionStore.getState().setSession({
    user: me.user,
    accessToken,
    agencies,
    activeAgencyId: me.user.role === "agency" ? pickActiveAgency(activeAgencyId, agencies) : null,
  });
  setRoleCookie(me.user.role);
}

export async function login(credentials: LoginRequest): Promise<void> {
  const { token, user } = await apiFetch("/api/auth/login", { method: "POST", body: credentials, schema: LoginResponse });
  useSessionStore.getState().applyToken(token, user);
  try {
    await commitSession();
  } catch (error) {
    useSessionStore.getState().clearSession();
    clearRoleCookie();
    throw error;
  }
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } catch {
    // The server session may linger until the refresh token expires, but this device is signed out regardless.
  } finally {
    endSessionLocally();
  }
}

let bootstrap: Promise<void> | null = null;

/**
 * App-start restore: refresh cookie -> access token -> /api/me. Module-level promise, so React StrictMode's
 * double mount (and any other caller) still produces ONE request chain.
 */
export function bootstrapSession(): Promise<void> {
  bootstrap ??= restore();
  return bootstrap;
}

/** Test helper. */
export function resetBootstrapForTests(): void {
  bootstrap = null;
}

async function restore(): Promise<void> {
  const store = useSessionStore.getState();
  if (store.status === "authenticated") return;
  store.setStatus("restoring");
  try {
    await refreshSession();
    await commitSession();
  } catch {
    // Not signed in (or the API is down). A login in the meantime wins; otherwise this is an anonymous visit.
    if (useSessionStore.getState().status !== "authenticated") {
      const s = useSessionStore.getState();
      s.setStatus("anonymous");
      useSessionStore.setState({ accessToken: null, user: null, agencies: [] });
      clearRoleCookie();
    }
  }
}
