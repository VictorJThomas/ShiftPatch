import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import type { ZodType } from "zod";
import { ErrorMessage, LoginResponse } from "@shiftpatch/contracts";
import { setRoleCookie } from "@/lib/role-cookie";
import { broadcastToken, onTokenShared } from "@/lib/session-channel";
import { getSessionEpoch, useSessionStore } from "@/stores/session";

/**
 * Same-origin client for `/api/*` (Next rewrites to the API, so the refresh cookie stays first-party).
 *
 * - Bearer comes from the in-memory store; `X-Agency-Id` is sent ONLY for agency users with a selection,
 *   and never to `/api/me` or `/api/auth/*` (the API 403s any stale or foreign header, whatever the role).
 * - 401 on a non-auth endpoint: ONE shared refresh (single-flight), then the request is retried at most once.
 *   Concurrent 401s await the same promise, so the client never replays a rotated refresh token itself.
 * - A retried request that 401s again ends the session. No loops.
 * - Only a 401 (or exhausted 409s) from the refresh ends the session. 429 / 5xx / network reach the caller as ApiError.
 * - Across tabs: refreshes run under a Web Lock and a fresh token is shared over BroadcastChannel (see session-channel).
 */

export class ApiError extends Error {
  readonly status: number;
  /** From a `Retry-After` header in seconds (429 / 503), when present. */
  readonly retryAfterMs: number | undefined;
  constructor(status: number, message: string, retryAfterMs?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

interface ApiHooks {
  /** Session is unrecoverable (refresh failed / retry 401): clear cookie + cache, go to /login. The store is already cleared. */
  onSessionLost: () => void;
  /** A 403 hit a request that carried X-Agency-Id; the selection was dropped. */
  onAgencyRejected: (message: string) => void;
}

let hooks: ApiHooks = { onSessionLost: () => {}, onAgencyRejected: () => {} };
export function configureApiClient(next: Partial<ApiHooks>): void {
  hooks = { ...hooks, ...next };
}

/** 409 = lost a concurrent rotation (e.g. another tab). Retry up to `attempts` times with a small jittered backoff. Mutable for tests. */
export const refreshRetry = { delayMs: 150, attempts: 3 };

const NETWORK_MESSAGE = "Network error. Check your connection and try again.";
const SESSION_MESSAGE = "Your session expired. Sign in again.";

const isAuthPath = (path: string) => path === "/api/auth" || path.startsWith("/api/auth/");
const sendsAgencyHeader = (path: string) => !isAuthPath(path) && path !== "/api/me" && !path.startsWith("/api/me?");
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function toApiError(res: Response): Promise<ApiError> {
  let message: string | null = null;
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string" && body.error) message = body.error;
  } catch {
    // not JSON (proxy error page, empty body): fall through to the generic text
  }
  message ??= res.status >= 500 ? "The server is unavailable. Try again in a moment." : `Request failed (${res.status})`;
  const retryAfter = Number(res.headers.get("retry-after"));
  return new ApiError(res.status, message, retryAfter > 0 ? retryAfter * 1000 : undefined);
}

async function safeFetch(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, { credentials: "same-origin", ...init });
  } catch {
    throw new ApiError(0, NETWORK_MESSAGE);
  }
}

// ---------------------------------------------------------------- refresh (single-flight per tab, coordinated across tabs)

/** Throttled (429), server down (5xx) or offline (0): the session may well be fine, so never treat it as signed out. */
export const isTransientStatus = (status: number) => status === 0 || status === 429 || status >= 500;

/** A token another tab obtained this recently is adopted instead of rotating the refresh token again. */
export const SHARED_TOKEN_FRESH_MS = 5_000;

let inflightRefresh: Promise<string> | null = null;
let sharedToken: { token: string; user: LoginResponse["user"]; at: number; epoch: number } | null = null;
let listening = false;

function listenForSharedTokens(): void {
  if (listening) return;
  listening = true;
  onTokenShared(({ token, user }) => {
    const parsed = LoginResponse.safeParse({ token, user });
    if (parsed.success) sharedToken = { ...parsed.data, at: Date.now(), epoch: getSessionEpoch() };
  });
}

/** Cross-tab mutex (Web Locks) so two tabs never rotate at once. Without the API (old browsers, jsdom) it just runs. */
function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : (navigator as Partial<Navigator>).locks;
  return locks ? locks.request("sp-refresh", fn) : fn();
}

function applyRefreshed(token: string, user: LoginResponse["user"]): string {
  sharedToken = null; // consumed, or superseded by our own rotation
  const prev = useSessionStore.getState().user;
  useSessionStore.getState().applyToken(token, { ...(prev?.id === user.id ? prev : {}), ...user });
  setRoleCookie(user.role);
  return token;
}

async function doRefresh(): Promise<string> {
  const epoch = getSessionEpoch();
  const stale = useSessionStore.getState().accessToken; // the token that 401'd (null on app start)
  return withRefreshLock(async () => {
    // Logged out (or re-logged-in) while waiting: applying anything would resurrect a dead session.
    if (getSessionEpoch() !== epoch) throw new ApiError(401, SESSION_MESSAGE);
    // Another tab rotated a moment ago (often while we waited for the lock): reuse its token, no second rotation.
    const shared = sharedToken;
    const age = shared ? Date.now() - shared.at : Infinity;
    if (shared && shared.epoch === epoch && shared.token !== stale && age >= 0 && age < SHARED_TOKEN_FRESH_MS) {
      return applyRefreshed(shared.token, shared.user);
    }
    for (let attempt = 1; ; attempt++) {
      const res = await safeFetch("/api/auth/refresh", { method: "POST", headers: { Accept: "application/json" } });
      // 409 = lost a concurrent rotation: the winner already set the new cookie, so retry after a short jittered delay.
      if (res.status === 409 && attempt < refreshRetry.attempts) {
        await sleep(refreshRetry.delayMs * attempt * (0.5 + Math.random()));
        continue;
      }
      if (!res.ok) throw await toApiError(res); // 429 carries retryAfterMs; callers decide (never "signed out")
      if (getSessionEpoch() !== epoch) throw new ApiError(401, SESSION_MESSAGE);
      const parsed = LoginResponse.safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new ApiError(502, "Unexpected response from the server.");
      broadcastToken(parsed.data.token, parsed.data.user);
      return applyRefreshed(parsed.data.token, parsed.data.user);
    }
  });
}

/** Shared by the 401 path and the app-start restore: any number of callers, one `POST /api/auth/refresh`. */
export function refreshSession(): Promise<string> {
  listenForSharedTokens();
  inflightRefresh ??= doRefresh().finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

// ---------------------------------------------------------------- requests

export interface ApiRequest<T> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON-encoded, except a `FormData` which is sent as multipart as-is. */
  body?: unknown;
  signal?: AbortSignal;
  /** Validates (and types) the JSON body. */
  schema?: ZodType<T>;
}

interface Sent {
  res: Response;
  agencyId: string | null;
}

async function send(path: string, opts: ApiRequest<unknown>, token: string | null): Promise<Sent> {
  const { user, activeAgencyId } = useSessionStore.getState();
  const headers: Record<string, string> = { Accept: "application/json" };
  // FormData: the browser sets multipart Content-Type with its boundary, so never set it here.
  const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
  if (opts.body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (token && !isAuthPath(path)) headers.Authorization = `Bearer ${token}`;
  const agencyId = user?.role === "agency" && activeAgencyId && sendsAgencyHeader(path) ? activeAgencyId : null;
  if (agencyId) headers["X-Agency-Id"] = agencyId;
  const res = await safeFetch(path, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers,
    body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
    signal: opts.signal,
  });
  return { res, agencyId };
}

function sessionLost(): ApiError {
  useSessionStore.getState().clearSession();
  hooks.onSessionLost();
  return new ApiError(401, SESSION_MESSAGE);
}

async function request(path: string, opts: ApiRequest<unknown>, retried: boolean): Promise<Sent> {
  const token = useSessionStore.getState().accessToken;
  const sent = await send(path, opts, token);
  if (sent.res.status !== 401 || isAuthPath(path)) return sent;
  if (retried) throw sessionLost(); // the fresh token was rejected too: stop, never loop
  // Another request may have refreshed while this one was in flight: then just replay with the new token.
  if (!token || useSessionStore.getState().accessToken === token) {
    try {
      await refreshSession();
    } catch (error) {
      // Throttled / API down / offline: the session is intact, so the caller just sees the error (query retry/Retry UI).
      if (error instanceof ApiError && isTransientStatus(error.status)) throw error;
      throw sessionLost();
    }
  }
  return request(path, opts, true);
}

export async function apiFetch<T = unknown>(path: string, opts: ApiRequest<T> = {}): Promise<T> {
  const { res, agencyId } = await request(path, opts, false);
  if (!res.ok) {
    const error = await toApiError(res);
    if (res.status === 403 && agencyId && error.message === ErrorMessage.agencyNotAllowed) {
      // The API says this X-Agency-Id is stale/foreign/revoked. Drop it and let the UI ask again.
      // A plain "Forbidden" is a normal permission denial (e.g. a viewer): the selection stays.
      useSessionStore.getState().setActiveAgency(null);
      hooks.onAgencyRejected(error.message);
    }
    throw error;
  }
  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json().catch(() => {
    throw new ApiError(502, "Unexpected response from the server.");
  });
  if (!opts.schema) return json as T;
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) throw new ApiError(502, "Unexpected response from the server.");
  return parsed.data;
}
