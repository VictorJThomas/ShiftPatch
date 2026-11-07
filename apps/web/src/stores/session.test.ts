import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "u1", name: "Alex Kim", role: "agency" as const, email: "alex@example.com" };
const agencies = [
  { agencyId: "agency-a", name: "Sunrise Health Staffing", role: "owner" as const },
  { agencyId: "agency-b", name: "Metro Care Partners", role: "manager" as const },
];

async function freshStore() {
  vi.resetModules();
  return import("./session");
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("session store persistence", () => {
  it("persists only activeAgencyId, never the token or user", async () => {
    const { useSessionStore, ACTIVE_AGENCY_KEY } = await freshStore();
    useSessionStore.getState().setSession({ user, accessToken: "secret-token-123", agencies, activeAgencyId: "agency-b" });

    expect(Object.keys(window.localStorage)).toEqual([ACTIVE_AGENCY_KEY]);
    expect(window.localStorage.getItem(ACTIVE_AGENCY_KEY)).toBe("agency-b");
    expect(window.sessionStorage.length).toBe(0);
    const everything = JSON.stringify({ ...window.localStorage, ...window.sessionStorage });
    expect(everything).not.toContain("secret-token-123");
    expect(everything).not.toContain("alex@example.com");
  });

  it("restores activeAgencyId on load", async () => {
    window.localStorage.setItem("sp.activeAgencyId", "agency-a");
    const { useSessionStore } = await freshStore();
    expect(useSessionStore.getState().activeAgencyId).toBe("agency-a");
    expect(useSessionStore.getState().accessToken).toBeNull();
  });

  it("clearSession wipes memory and the stored selection", async () => {
    const { useSessionStore } = await freshStore();
    useSessionStore.getState().setSession({ user, accessToken: "t", agencies, activeAgencyId: "agency-a" });
    useSessionStore.getState().clearSession();
    expect(useSessionStore.getState()).toMatchObject({ user: null, accessToken: null, agencies: [], activeAgencyId: null, status: "anonymous" });
    expect(window.localStorage.length).toBe(0);
  });

  it("keeps the selection and agencies across a token refresh (setSession without them)", async () => {
    const { useSessionStore } = await freshStore();
    useSessionStore.getState().setSession({ user, accessToken: "t1", agencies, activeAgencyId: "agency-a" });
    useSessionStore.getState().setSession({ user, accessToken: "t2" });
    expect(useSessionStore.getState()).toMatchObject({ accessToken: "t2", activeAgencyId: "agency-a" });
    expect(useSessionStore.getState().agencies).toHaveLength(2);
  });

  it("does not crash when storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const { useSessionStore } = await freshStore();
    expect(useSessionStore.getState().activeAgencyId).toBeNull();
    expect(() => useSessionStore.getState().setActiveAgency("agency-a")).not.toThrow();
    expect(useSessionStore.getState().activeAgencyId).toBe("agency-a"); // still works in memory
    expect(() => useSessionStore.getState().setSession({ user, accessToken: "t", agencies, activeAgencyId: null })).not.toThrow();
    expect(() => useSessionStore.getState().clearSession()).not.toThrow();
  });
});

describe("pickActiveAgency", () => {
  it("prefers the stored id while it is still a membership", async () => {
    const { pickActiveAgency } = await freshStore();
    expect(pickActiveAgency("agency-b", agencies)).toBe("agency-b");
  });
  it("drops a stored id that is no longer a membership", async () => {
    const { pickActiveAgency } = await freshStore();
    expect(pickActiveAgency("agency-z", agencies)).toBeNull();
    expect(pickActiveAgency("agency-z", agencies.slice(0, 1))).toBe("agency-a");
  });
  it("auto-selects the only membership, else null", async () => {
    const { pickActiveAgency } = await freshStore();
    expect(pickActiveAgency(null, agencies.slice(0, 1))).toBe("agency-a");
    expect(pickActiveAgency(null, agencies)).toBeNull();
    expect(pickActiveAgency(null, [])).toBeNull();
  });
});
