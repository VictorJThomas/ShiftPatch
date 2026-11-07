import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "@/stores/session";
import { bootstrapSession, login, resetBootstrapForTests } from "./session-flow";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const user = { id: "u1", name: "Maria Lopez", role: "nurse" as const };

beforeEach(() => {
  resetBootstrapForTests();
  useSessionStore.setState({ user: null, accessToken: null, agencies: [], activeAgencyId: null, status: "idle" });
});
afterEach(() => vi.unstubAllGlobals());

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
