// Repository scope enforcement against a real throwaway Postgres (seed: shift-1 + shift-2 agency-a, shift-3 agency-b).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, shifts } from "../../db/schema/index.js";
import { seed } from "../../db/seed.js";
import { createTestDb } from "../../db/test-db.js";
import * as auditRepo from "../audit/repository.js";
import * as shiftRepo from "../shifts/repository.js";
import type { Actor } from "./actor.js";
import { agencyScope, agencyScopeForAdmin, type AgencyScope, networkScope, type NetworkScope } from "./scope.js";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db);
  await t.db.insert(auditLog).values([
    { action: "x.a", entityType: "shift", entityId: "shift-1", agencyId: "agency-a", networkId: "network-default" },
    { action: "x.b", entityType: "shift", entityId: "shift-3", agencyId: "agency-b", networkId: "network-default" },
    { action: "x.net", entityType: "network", entityId: "network-default", networkId: "network-default" },
  ]);
});
afterAll(() => t?.drop());

const base = { userId: "u", status: "active", nurseNetworkId: null } as const;
const ownerA: Actor = { ...base, role: "agency", agencies: [{ agencyId: "agency-a", role: "owner" }], networkIds: [], activeAgencyId: "agency-a" };
const adminDefault: Actor = { ...base, role: "admin", agencies: [], networkIds: ["network-default"], activeAgencyId: null };
const adminOther: Actor = { ...adminDefault, networkIds: ["network-2"] };
const nurse: Actor = { ...base, role: "nurse", agencies: [], networkIds: [], activeAgencyId: null };

describe("scope issuance", () => {
  it("agencyScope only for agencies the actor actively belongs to", () => {
    expect(agencyScope(ownerA, "agency-a").agencyIds).toEqual(["agency-a"]);
    expect(() => agencyScope(ownerA, "agency-b")).toThrow(/not a member/);
    expect(() => agencyScope(nurse, "agency-a")).toThrow();
    expect(() => agencyScope(adminDefault, "agency-a")).toThrow();
  });
  it("networkScope only for admins of that network", () => {
    expect(networkScope(adminDefault, "network-default").networkId).toBe("network-default");
    expect(() => networkScope(adminOther, "network-default")).toThrow(/not an admin/); // admin outside their network
    expect(() => networkScope(ownerA, "network-default")).toThrow();
    expect(() => networkScope(nurse, "network-default")).toThrow();
  });
  it("an admin gets a single-agency scope only for agencies inside their network", async () => {
    const s = agencyScopeForAdmin(adminDefault, "agency-a", "network-default");
    expect((await shiftRepo.listByAgency(t.db, s)).map((r) => r.id).sort()).toEqual(["shift-1", "shift-2"]); // admin 200 path
    expect(() => agencyScopeForAdmin(adminOther, "agency-a", "network-default")).toThrow();
    expect(() => agencyScopeForAdmin(ownerA, "agency-a", "network-default")).toThrow();
  });
  it("issued scopes are frozen", () => {
    expect(Object.isFrozen(agencyScope(ownerA, "agency-a"))).toBe(true);
  });
});

describe("shift repository", () => {
  it("agency scope returns only that agency's shifts", async () => {
    const rows = await shiftRepo.listByAgency(t.db, agencyScope(ownerA, "agency-a"));
    expect(rows.map((r) => r.id).sort()).toEqual(["shift-1", "shift-2"]);
  });
  it("network scope returns every agency's shifts in that network (admin reporting)", async () => {
    const rows = await shiftRepo.listByNetwork(t.db, networkScope(adminDefault, "network-default"));
    expect(rows.map((r) => r.id).sort()).toEqual(["shift-1", "shift-2", "shift-3"]);
  });
  it("soft-deleted shifts are excluded", async () => {
    await t.db.update(shifts).set({ deletedAt: new Date() }).where(eq(shifts.id, "shift-1"));
    const rows = await shiftRepo.listByAgency(t.db, agencyScope(ownerA, "agency-a"));
    expect(rows.map((r) => r.id)).toEqual(["shift-2"]);
    await t.db.update(shifts).set({ deletedAt: null }).where(eq(shifts.id, "shift-1"));
  });
});

describe("forged scopes fail closed", () => {
  it("a hand-built object (cast) is rejected at runtime by every repository function", async () => {
    const fakeAgency = { agencyIds: ["agency-a", "agency-b"] } as unknown as AgencyScope;
    const fakeNetwork = { networkId: "network-default" } as unknown as NetworkScope;
    await expect(shiftRepo.listByAgency(t.db, fakeAgency)).rejects.toThrow(/forged/);
    await expect(shiftRepo.listByNetwork(t.db, fakeNetwork)).rejects.toThrow(/forged/);
    await expect(auditRepo.listByAgency(t.db, fakeAgency)).rejects.toThrow(/forged/);
    await expect(auditRepo.listByNetwork(t.db, fakeNetwork)).rejects.toThrow(/forged/);
  });
  it("a copy of a real scope is also rejected (identity-based, not shape-based)", async () => {
    const copy = { ...agencyScope(ownerA, "agency-a") } as unknown as AgencyScope;
    await expect(shiftRepo.listByAgency(t.db, copy)).rejects.toThrow(/forged/);
  });
  it("compile time: plain objects and missing scopes do not type-check", async () => {
    // @ts-expect-error a literal is not an AgencyScope
    await expect(shiftRepo.listByAgency(t.db, { agencyIds: ["agency-a"] })).rejects.toThrow();
    // @ts-expect-error the scope argument is required
    await expect(shiftRepo.listByNetwork(t.db)).rejects.toThrow();
  });
});

describe("audit repository", () => {
  it("agency scope returns only rows carrying its agency_id", async () => {
    const rows = await auditRepo.listByAgency(t.db, agencyScope(ownerA, "agency-a"));
    expect(rows.map((r) => r.action)).toEqual(["x.a"]);
  });
  it("network scope returns the whole network's rows", async () => {
    const rows = await auditRepo.listByNetwork(t.db, networkScope(adminDefault, "network-default"));
    expect(rows.map((r) => r.action).sort()).toEqual(["x.a", "x.b", "x.net"]);
  });
});

