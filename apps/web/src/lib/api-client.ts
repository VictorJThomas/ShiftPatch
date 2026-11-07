import type { ZodType } from "zod";
import { ErrorMessage, LoginResponse } from "@shiftpatch/contracts";
import { setRoleCookie } from "@/lib/role-cookie";
import { getSessionEpoch, useSessionStore } from "@/stores/session";

/**
 * Same-origin client for `/api/*` (Next rewrites to the API, so the refresh cookie stays first-party).
 *
 * - Bearer comes from the in-memory store; `X-Agency-Id` is sent ONLY for agency users with a selection,
 *   and never to `/api/me` or `/api/auth/*` (the API 403s any stale or foreign header, whatever the role).
 * - 401 on a non-auth endpoint: ONE shared refresh (single-flight), then the request is retried at most once.
 *   Concurrent 401s await the same promise, so the client never replays a rotated refresh token itself.
 * - A retried request that 401s again ends the session. No loops.
 */

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
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
  return new ApiError(res.status, message);
}

async function safeFetch(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, { credentials: "same-origin", ...init });
  } catch {
    throw new ApiError(0, NETWORK_MESSAGE);
  }
}

// ---------------------------------------------------------------- refresh (single-flight)

let inflightRefresh: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  const epoch = getSessionEpoch();
  for (let attempt = 1; ; attempt++) {
    const res = await safeFetch("/api/auth/refresh", { method: "POST", headers: { Accept: "application/json" } });
    // 409 = lost a concurrent rotation: the winner already set the new cookie, so retry after a short jittered delay.
    if (res.status === 409 && attempt < refreshRetry.attempts) {
      await sleep(refreshRetry.delayMs * attempt * (0.5 + Math.random()));
      continue;
    }
    if (!res.ok) throw await toApiError(res);
    // Logged out (or re-logged-in) while this was in flight: applying it would resurrect a dead session.
    if (getSessionEpoch() !== epoch) throw new ApiError(401, SESSION_MESSAGE);
    const parsed = LoginResponse.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new ApiError(502, "Unexpected response from the server.");
    const { token, user } = parsed.data;
    const prev = useSessionStore.getState().user;
    useSessionStore.getState().applyToken(token, { ...(prev?.id === user.id ? prev : {}), ...user });
    setRoleCookie(user.role);
    return token;
  }
}

/** Shared by the 401 path and the app-start restore: any number of callers, one `POST /api/auth/refresh`. */
export function refreshSession(): Promise<string> {
  inflightRefresh ??= doRefresh().finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

// ---------------------------------------------------------------- requests

export interface ApiRequest<T> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
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
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (token && !isAuthPath(path)) headers.Authorization = `Bearer ${token}`;
  const agencyId = user?.role === "agency" && activeAgencyId && sendsAgencyHeader(path) ? activeAgencyId : null;
  if (agencyId) headers["X-Agency-Id"] = agencyId;
  const res = await safeFetch(path, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
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
    } catch {
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
