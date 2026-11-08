import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorMessage } from "@shiftpatch/contracts";
import { ApiError, apiFetch, configureApiClient, refreshRetry, refreshSession, SHARED_TOKEN_FRESH_MS } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const refreshOk = (token: string, role: "nurse" | "agency" | "admin" = "nurse") => json(200, { token, user: { id: "u1", name: "Maria Lopez", role } });

type Call = { path: string; method: string; headers: Record<string, string> };
let calls: Call[];
let handler: (call: Call) => Response | Promise<Response>;

const callsTo = (path: string) => calls.filter((c) => c.path === path);

beforeEach(() => {
  calls = [];
  refreshRetry.delayMs = 0;
  vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
    const call = { path: input, method: init.method ?? "GET", headers: (init.headers ?? {}) as Record<string, string> };
    calls.push(call);
    return handler(call);
  });
  window.localStorage.clear();
  useSessionStore.setState({ user: null, accessToken: null, agencies: [], activeAgencyId: null, status: "idle" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  configureApiClient({ onSessionLost: () => {}, onAgencyRejected: () => {} });
});

const signIn = (role: "nurse" | "agency" | "admin", token = "tok-1", activeAgencyId: string | null = null) =>
  useSessionStore.setState({ user: { id: "u1", name: "Maria Lopez", role }, accessToken: token, status: "authenticated", activeAgencyId });

describe("headers", () => {
  it("sends the in-memory bearer token and nothing else secret", async () => {
    signIn("nurse");
    handler = () => json(200, { ok: true });
    await apiFetch("/api/shifts");
    expect(callsTo("/api/shifts")[0]?.headers.Authorization).toBe("Bearer tok-1");
  });

  it("sends FormData as-is with no JSON Content-Type (browser sets the multipart boundary)", async () => {
    signIn("nurse");
    let sentBody: unknown;
    vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
      calls.push({ path: input, method: init.method ?? "GET", headers: (init.headers ?? {}) as Record<string, string> });
      sentBody = init.body;
      return json(201, { ok: true });
    });
    const form = new FormData();
    form.set("type", "license");
    await apiFetch("/api/nurses/me/credentials", { method: "POST", body: form });
    const call = callsTo("/api/nurses/me/credentials")[0];
    expect(call?.method).toBe("POST");
    expect(call?.headers["Content-Type"]).toBeUndefined();
    expect(sentBody).toBe(form);
  });

  it("sends no Authorization header when signed out", async () => {
    handler = () => json(200, {});
    await apiFetch("/api/shifts");
    expect(callsTo("/api/shifts")[0]?.headers.Authorization).toBeUndefined();
  });

  it("sends X-Agency-Id only for agency users with a selection", async () => {
    handler = () => json(200, {});
    signIn("agency", "tok-1", "agency-a");
    await apiFetch("/api/shifts");
    expect(callsTo("/api/shifts")[0]?.headers["X-Agency-Id"]).toBe("agency-a");

    signIn("agency", "tok-1", null);
    await apiFetch("/api/shifts");
    expect(callsTo("/api/shifts")[1]?.headers["X-Agency-Id"]).toBeUndefined();
  });

  it("never sends X-Agency-Id for nurse or admin, even with a stale stored id", async () => {
    handler = () => json(200, {});
    for (const role of ["nurse", "admin"] as const) {
      signIn(role, "tok-1", "agency-a");
      await apiFetch("/api/shifts");
    }
    expect(callsTo("/api/shifts").map((c) => c.headers["X-Agency-Id"])).toEqual([undefined, undefined]);
  });

  it("never sends X-Agency-Id to /api/me or /api/auth/*", async () => {
    handler = () => json(200, {});
    signIn("agency", "tok-1", "agency-a");
    await apiFetch("/api/me");
    await apiFetch("/api/auth/logout", { method: "POST" });
    expect(calls.map((c) => c.headers["X-Agency-Id"])).toEqual([undefined, undefined]);
  });

  it("does not attach the bearer to /api/auth/*", async () => {
    signIn("nurse");
    handler = () => new Response(null, { status: 204 });
    await apiFetch("/api/auth/logout", { method: "POST" });
    expect(calls[0]?.headers.Authorization).toBeUndefined();
  });
});

describe("error normalization", () => {
  it("turns { error } bodies into ApiError(status, message)", async () => {
    handler = () => json(429, { error: "Too many requests, try again later" });
    await expect(apiFetch("/api/auth/login", { method: "POST", body: {} })).rejects.toMatchObject({
      name: "ApiError",
      status: 429,
      message: "Too many requests, try again later",
    });
  });

  it("falls back to readable text for non-JSON bodies", async () => {
    handler = () => new Response("<html>Bad gateway</html>", { status: 502 });
    const error = await apiFetch("/api/shifts").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
    expect((error as ApiError).message).toBe("The server is unavailable. Try again in a moment.");

    handler = () => new Response("nope", { status: 404 });
    await expect(apiFetch("/api/shifts")).rejects.toMatchObject({ status: 404, message: "Request failed (404)" });
  });

  it("maps a network failure to ApiError(0)", async () => {
    handler = () => {
      throw new TypeError("Failed to fetch");
    };
    await expect(apiFetch("/api/shifts")).rejects.toMatchObject({ status: 0 });
  });
});

describe("401 handling", () => {
  it("refreshes once for concurrent 401s, then retries each request", async () => {
    signIn("nurse", "old");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    handler = async (call) => {
      if (call.path === "/api/auth/refresh") {
        await gate; // keep the refresh in flight while every request lands its 401
        return refreshOk("new");
      }
      return call.headers.Authorization === "Bearer new" ? json(200, { ok: call.path }) : json(401, { error: "Unauthorized" });
    };
    const all = Promise.all([apiFetch("/api/a"), apiFetch("/api/b"), apiFetch("/api/c")]);
    await vi.waitFor(() => expect(calls.filter((c) => c.headers.Authorization === "Bearer old")).toHaveLength(3));
    release();
    await expect(all).resolves.toHaveLength(3);
    expect(callsTo("/api/auth/refresh")).toHaveLength(1);
    expect(useSessionStore.getState().accessToken).toBe("new");
  });

  it("replays without refreshing when another request already rotated the token", async () => {
    signIn("nurse", "old");
    handler = (call) => {
      if (call.headers.Authorization === "Bearer old") {
        useSessionStore.setState({ accessToken: "new" }); // the rotation lands while this request is in flight
        return json(401, { error: "Unauthorized" });
      }
      return json(200, { ok: true });
    };
    await expect(apiFetch("/api/late")).resolves.toEqual({ ok: true });
    expect(callsTo("/api/auth/refresh")).toHaveLength(0);
    expect(callsTo("/api/late")).toHaveLength(2);
  });

  it("retries a request at most once, then ends the session (no loop)", async () => {
    signIn("nurse", "old");
    const lost = vi.fn();
    configureApiClient({ onSessionLost: lost });
    handler = (call) => (call.path === "/api/auth/refresh" ? refreshOk("new") : json(401, { error: "Unauthorized" }));
    await expect(apiFetch("/api/shifts")).rejects.toMatchObject({ status: 401 });
    expect(callsTo("/api/shifts")).toHaveLength(2);
    expect(callsTo("/api/auth/refresh")).toHaveLength(1);
    expect(lost).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState()).toMatchObject({ status: "anonymous", accessToken: null, user: null });
  });

  it.each(["/api/auth/login", "/api/auth/refresh", "/api/auth/logout"])("never refreshes on a 401 from %s", async (path) => {
    handler = () => json(401, { error: "Invalid email or password" });
    await expect(apiFetch(path, { method: "POST", body: {} })).rejects.toMatchObject({ status: 401, message: "Invalid email or password" });
    expect(calls).toHaveLength(1);
  });

  it("retries the refresh once after a 409 race", async () => {
    signIn("nurse", "old");
    let refreshes = 0;
    handler = (call) => {
      if (call.path === "/api/auth/refresh") return ++refreshes === 1 ? json(409, { error: "Session refresh already in progress, retry" }) : refreshOk("new");
      return call.headers.Authorization === "Bearer new" ? json(200, { done: true }) : json(401, { error: "Unauthorized" });
    };
    await expect(apiFetch("/api/shifts")).resolves.toEqual({ done: true });
    expect(refreshes).toBe(2);
  });

  it("gives up after the third 409 and clears the session", async () => {
    signIn("nurse", "old");
    const lost = vi.fn();
    configureApiClient({ onSessionLost: lost });
    handler = (call) => (call.path === "/api/auth/refresh" ? json(409, { error: "retry" }) : json(401, { error: "Unauthorized" }));
    await expect(apiFetch("/api/shifts")).rejects.toMatchObject({ status: 401 });
    expect(callsTo("/api/auth/refresh")).toHaveLength(3);
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it("clears the session when the refresh itself is rejected", async () => {
    signIn("nurse", "old");
    const lost = vi.fn();
    configureApiClient({ onSessionLost: lost });
    handler = (call) => (call.path === "/api/auth/refresh" ? json(401, { error: "Unauthorized" }) : json(401, { error: "Unauthorized" }));
    await expect(apiFetch("/api/shifts")).rejects.toMatchObject({ status: 401 });
    expect(callsTo("/api/shifts")).toHaveLength(1); // not retried: there is no new token
    expect(lost).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().status).toBe("anonymous");
  });
});

describe("throttled refresh (QA-006)", () => {
  it.each([
    [429, { "retry-after": "7" }, 7000],
    [503, {}, undefined],
  ])("a %i from the refresh reaches the caller as ApiError and keeps the session", async (status, headers, retryAfterMs) => {
    signIn("nurse", "old");
    const lost = vi.fn();
    configureApiClient({ onSessionLost: lost });
    handler = (call) =>
      call.path === "/api/auth/refresh"
        ? new Response(JSON.stringify({ error: "Too many requests, try again later" }), { status, headers })
        : json(401, { error: "Unauthorized" });
    const error = await apiFetch("/api/shifts").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, retryAfterMs });
    expect(callsTo("/api/auth/refresh")).toHaveLength(1); // no retry storm from the 401 path
    expect(lost).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toMatchObject({ status: "authenticated", accessToken: "old", user: { id: "u1" } });
  });
});

describe("cross-tab refresh", () => {
  const otherTab = () => new BroadcastChannel("sp-session");
  const messages = (ch: BroadcastChannel) => {
    const got: unknown[] = [];
    ch.onmessage = (e) => got.push(e.data);
    return got;
  };

  it("runs the refresh under the sp-refresh Web Lock and shares the new token with other tabs", async () => {
    const request = vi.fn((_name: string, fn: () => Promise<unknown>) => fn());
    Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
    const tab = otherTab();
    const got = messages(tab);
    try {
      handler = () => refreshOk("rotated");
      await expect(refreshSession()).resolves.toBe("rotated");
      expect(request).toHaveBeenCalledWith("sp-refresh", expect.any(Function));
      await vi.waitFor(() => expect(got).toContainEqual({ type: "token", token: "rotated", user: { id: "u1", name: "Maria Lopez", role: "nurse" } }));
    } finally {
      tab.close();
      Reflect.deleteProperty(navigator, "locks");
    }
  });

  it("adopts a token another tab just obtained instead of rotating again (no POST /api/auth/refresh)", async () => {
    signIn("nurse", "old");
    await refreshSession().catch(() => {}); // starts the listener (first refresh of the page)
    calls = [];
    const tab = otherTab();
    try {
      tab.postMessage({ type: "token", token: "from-other-tab", user: { id: "u1", name: "Maria Lopez", role: "nurse" } });
      await new Promise((resolve) => setTimeout(resolve, 20)); // let the message land
      handler = (call) => (call.headers.Authorization === "Bearer from-other-tab" ? json(200, { ok: true }) : json(401, { error: "Unauthorized" }));
      await expect(apiFetch("/api/shifts")).resolves.toEqual({ ok: true });
      expect(callsTo("/api/auth/refresh")).toHaveLength(0);
      expect(useSessionStore.getState().accessToken).toBe("from-other-tab");
    } finally {
      tab.close();
    }
  });

  it("ignores a malformed message and a token older than the freshness window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    signIn("nurse", "old");
    await refreshSession().catch(() => {});
    const tab = otherTab();
    try {
      tab.postMessage({ type: "token", token: "evil", user: { id: "u1", role: "root" } });
      tab.postMessage({ type: "token", token: "stale", user: { id: "u1", name: "Maria Lopez", role: "nurse" } });
      await new Promise((resolve) => setTimeout(resolve, 20)); // let both messages land
      vi.setSystemTime(Date.now() + SHARED_TOKEN_FRESH_MS + 1);
      calls = [];
      handler = (call) => (call.path === "/api/auth/refresh" ? refreshOk("rotated") : json(200, {}));
      await expect(refreshSession()).resolves.toBe("rotated");
      expect(callsTo("/api/auth/refresh")).toHaveLength(1);
    } finally {
      tab.close();
      vi.useRealTimers();
    }
  });
});

describe("session epoch", () => {
  it("discards a refresh that resolves after logout (no token, no role cookie)", async () => {
    signIn("nurse", "old");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    handler = async (call) => {
      if (call.path === "/api/auth/refresh") {
        await gate;
        return refreshOk("zombie");
      }
      return json(401, { error: "Unauthorized" });
    };
    const request = apiFetch("/api/shifts").catch((e: unknown) => e);
    await vi.waitFor(() => expect(callsTo("/api/auth/refresh")).toHaveLength(1));
    useSessionStore.getState().clearSession(); // logout while the refresh is in flight
    document.cookie = "sp_role=; Max-Age=0; Path=/";
    release();
    expect(await request).toBeInstanceOf(ApiError);
    expect(useSessionStore.getState()).toMatchObject({ accessToken: null, user: null, status: "anonymous" });
    expect(document.cookie).not.toContain("sp_role=nurse");
  });
});

describe("403 with an agency selection", () => {
  it("keeps the selection on a plain permission denial (403 Forbidden)", async () => {
    signIn("agency", "tok-1", "agency-b");
    const rejected = vi.fn();
    configureApiClient({ onAgencyRejected: rejected });
    handler = () => json(403, { error: ErrorMessage.forbidden });
    await expect(apiFetch("/api/shifts/s1/withdraw", { method: "POST" })).rejects.toMatchObject({ status: 403, message: "Forbidden" });
    expect(useSessionStore.getState().activeAgencyId).toBe("agency-b");
    expect(rejected).not.toHaveBeenCalled();
  });

  it("drops activeAgencyId only on the agencyNotAllowed message and reports it", async () => {
    signIn("agency", "tok-1", "agency-b");
    const rejected = vi.fn();
    configureApiClient({ onAgencyRejected: rejected });
    handler = () => json(403, { error: ErrorMessage.agencyNotAllowed });
    await expect(apiFetch("/api/agencies/agency-b/shifts")).rejects.toMatchObject({ status: 403 });
    expect(useSessionStore.getState().activeAgencyId).toBeNull();
    expect(window.localStorage.getItem("sp.activeAgencyId")).toBeNull();
    expect(rejected).toHaveBeenCalledWith(ErrorMessage.agencyNotAllowed);
  });

  it("leaves the selection alone when no X-Agency-Id was sent", async () => {
    signIn("nurse", "tok-1", "agency-a");
    handler = () => json(403, { error: "Forbidden" });
    await expect(apiFetch("/api/shifts")).rejects.toMatchObject({ status: 403 });
    expect(useSessionStore.getState().activeAgencyId).toBe("agency-a");
  });
});
