import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "@/stores/session";
import { bootstrapSession, login, resetBootstrapForTests, retrySession } from "./session-flow";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const user = { id: "u1", name: "Maria Lopez", role: "nurse" as const };

beforeEach(() => {
  resetBootstrapForTests();
  useSessionStore.setState({ user: null, accessToken: null, agencies: [], activeAgencyId: null, status: "idle" });
});
afterEach(() => vi.unstubAllGlobals());

describe("restore on 429 / 5xx (QA-006)", () => {
  const me = () => json(200, { user: { ...user, email: "maria@example.com" }, agencies: [] });
  let refreshes: number;
  const stubRefresh = (answer: (n: number) => Response) => {
    refreshes = 0;
    vi.stubGlobal("fetch", async (path: string) => (path === "/api/auth/refresh" ? answer(++refreshes) : path === "/api/me" ? me() : json(404, {})));
  };
  const tooMany = () => new Response(JSON.stringify({ error: "Too many requests, try again later" }), { status: 429, headers: { "retry-after": "2" } });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0); // no jitter: exact delays
  });
  afterEach(() => vi.useRealTimers());

  it("429 then 200: waits Retry-After, then keeps the session (never anonymous in between)", async () => {
    stubRefresh((n) => (n === 1 ? tooMany() : json(200, { token: "tok", user })));
    const done = bootstrapSession();
    await vi.advanceTimersByTimeAsync(1999); // Retry-After 2 s beats the 1 s exponential step
    expect(refreshes).toBe(1);
    expect(useSessionStore.getState().status).toBe("restoring");
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(refreshes).toBe(2);
    expect(useSessionStore.getState()).toMatchObject({ status: "authenticated", accessToken: "tok", user: { id: "u1" } });
  });

  it("repeated 429: 3 attempts with capped waits, then the recoverable 'unavailable' state, then Try again works", async () => {
    stubRefresh(() => new Response(JSON.stringify({ error: "Too many requests, try again later" }), { status: 429, headers: { "retry-after": "60" } }));
    const done = bootstrapSession();
    await vi.advanceTimersByTimeAsync(10_000); // 60 s Retry-After is capped at 10 s per wait
    expect(refreshes).toBe(2);
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(refreshes).toBe(3);
    expect(useSessionStore.getState().status).toBe("unavailable");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refreshes).toBe(3); // bounded: nothing keeps retrying on its own

    stubRefresh(() => json(200, { token: "tok", user }));
    await retrySession();
    expect(useSessionStore.getState()).toMatchObject({ status: "authenticated", accessToken: "tok" });
  });

  it("5xx and network errors are retried the same way; a 401 is anonymous at once", async () => {
    stubRefresh((n) => (n === 1 ? json(503, { error: "down" }) : json(200, { token: "tok", user })));
    const ok = bootstrapSession();
    await vi.advanceTimersByTimeAsync(1000);
    await ok;
    expect(useSessionStore.getState().status).toBe("authenticated");

    resetBootstrapForTests();
    useSessionStore.setState({ user: null, accessToken: null, status: "idle" });
    stubRefresh(() => json(401, { error: "Unauthorized" }));
    await bootstrapSession();
    expect(refreshes).toBe(1);
    expect(useSessionStore.getState().status).toBe("anonymous");
  });
});

describe("restore vs login race", () => {
  it("a slow cold refresh that 401s after the user logged in cannot wipe the fresh session", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal("fetch", async (path: string) => {
      if (path === "/api/auth/refresh") {
        await gate; // hangs while the user types and signs in
        return json(401, { error: "Unauthorized" });
      }
      if (path === "/api/auth/login") return json(200, { token: "fresh", user });
      if (path === "/api/me") return json(200, { user: { ...user, email: "maria@example.com" }, agencies: [] });
      return json(404, { error: "nope" });
    });

    const restore = bootstrapSession();
    await login({ email: "maria@example.com", password: "pw" });
    expect(useSessionStore.getState()).toMatchObject({ status: "authenticated", accessToken: "fresh" });

    release();
    await restore;
    expect(useSessionStore.getState()).toMatchObject({ status: "authenticated", accessToken: "fresh", user: { id: "u1" } });
  });
});
