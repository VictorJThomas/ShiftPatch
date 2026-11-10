import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import { LoginResponse, MeResponse, type LoginRequest } from "@shiftpatch/contracts";
import { ApiError, apiFetch, isTransientStatus, refreshSession } from "@/lib/api-client";
import { getQueryClient } from "@/lib/query-client";
import { clearRoleCookie, setRoleCookie } from "@/lib/role-cookie";
import { broadcastSignedOut } from "@/lib/session-channel";
import { bumpSessionEpoch, getSessionEpoch, pickActiveAgency, useSessionStore } from "@/stores/session";

/** Drop everything session-shaped on this device: store, role cookie, cached server state. */
export function endSessionLocally({ broadcast = true } = {}): void {
  useSessionStore.getState().clearSession();
  clearRoleCookie();
  getQueryClient().clear();
  if (broadcast) broadcastSignedOut(); // other tabs end their session too
}

export const fetchMe = () => apiFetch("/api/me", { schema: MeResponse });

/** `/api/me` for the memberships, then commit the session (status -> authenticated). The token must already be in the store. */
async function commitSession(): Promise<void> {
  const me = await fetchMe();
  const { accessToken, activeAgencyId } = useSessionStore.getState();
  if (!accessToken) throw new Error("No access token"); // cleared meanwhile (logout / expiry)
  const agencies = me.agencies.map(({ agencyId, name, role, timezone }) => ({ agencyId, name, role, timezone }));
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
  bumpSessionEpoch(); // a restore/refresh still in flight belongs to the previous session and must not touch this one
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
 * double mount (and any other caller) still produces ONE request chain per page load.
 */
export function bootstrapSession(): Promise<void> {
  bootstrap ??= restore();
  return bootstrap;
}

/** "Try again" from the `unavailable` state: one new restore chain (a no-op while one is running or after success). */
export function retrySession(): Promise<void> {
  if (useSessionStore.getState().status === "unavailable") bootstrap = restore();
  return bootstrapSession();
}

/** Test helper. */
export function resetBootstrapForTests(): void {
  bootstrap = null;
}

/** Restore retries on 429 / 5xx / network: `attempts` tries in total, exponential from `baseDelayMs`, each wait capped. Mutable for tests. */
export const restoreRetry = { attempts: 3, baseDelayMs: 1_000, maxDelayMs: 10_000 };

/** max(Retry-After, exponential step) + up to 20% jitter, capped. */
export function restoreDelay(attempt: number, retryAfterMs = 0): number {
  const step = Math.max(retryAfterMs, restoreRetry.baseDelayMs * 2 ** (attempt - 1));
  return Math.min(restoreRetry.maxDelayMs, step * (1 + Math.random() * 0.2));
}

async function restore(): Promise<void> {
  const store = useSessionStore.getState();
  if (store.status === "authenticated") return;
  store.setStatus("restoring");
  const epoch = getSessionEpoch();
  for (let attempt = 1; ; attempt++) {
    try {
      // A token from an earlier attempt (refresh ok, /api/me failed) is reused: don't burn another rotation.
      if (!useSessionStore.getState().accessToken) await refreshSession();
      await commitSession();
      return;
    } catch (error) {
      if (getSessionEpoch() !== epoch || useSessionStore.getState().status === "authenticated") return; // a login won
      if (!(error instanceof ApiError && isTransientStatus(error.status))) {
        // 401 (no / dead refresh cookie) or a bad response: an anonymous visit.
        useSessionStore.setState({ status: "anonymous", accessToken: null, user: null, agencies: [] });
        clearRoleCookie();
        return;
      }
      // Throttled / API down / offline: the session is probably fine. Bounded retries, then a recoverable state.
      if (attempt >= restoreRetry.attempts) {
        useSessionStore.getState().setStatus("unavailable");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, restoreDelay(attempt, error.retryAfterMs)));
    }
  }
}
