import { verify } from "@node-rs/argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seed } from "./seed.js";
import { createTestDb } from "./test-db.js";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db);
}, 60_000);
afterAll(async () => {
  await t?.drop();
});

const count = async (table: string) => Number((await t.sql.unsafe(`SELECT count(*)::int AS n FROM ${table}`))[0]!.n);

describe("seed: exact spec data", () => {
  it("loads the 2 agencies", async () => {
    const rows = await t.sql`SELECT id, name FROM agencies ORDER BY id`;
    expect(rows.map((r) => [r.id, r.name])).toEqual([
      ["agency-a", "Sunrise Health Staffing"],
      ["agency-b", "Metro Care Partners"],
    ]);
  });

  it("loads users with spec ids, emails, names and roles", async () => {
    const rows = await t.sql`SELECT u.id, u.email, p.full_name, u.role FROM users u JOIN user_profiles p ON p.user_id = u.id ORDER BY u.id`;
    expect(rows.map((r) => [r.id, r.email, r.full_name, r.role])).toEqual([
      ["admin-1", "alex.kim@example.com", "Alex Kim", "admin"],
      ["agency-a", "admin@sunrisehealth.example", "Sunrise Health Staffing", "agency"],
      ["agency-b", "admin@metrocare.example", "Metro Care Partners", "agency"],
      ["nurse-1", "maria.lopez@example.com", "Maria Lopez", "nurse"],
      ["nurse-2", "james.cook@example.com", "James Cook", "nurse"],
    ]);
  });

  it("hashes every password (argon2id) so Trial2026! verifies", async () => {
    const rows = await t.sql`SELECT password_hash FROM users`;
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(r.password_hash).toMatch(/^\$argon2id\$/);
      expect(await verify(r.password_hash, "Trial2026!")).toBe(true);
    }
  });

  it("loads the 3 shifts exactly", async () => {
    const rows = await t.sql`SELECT id, agency_id, role, shift_date::text AS d, start_time::text AS s, end_time::text AS e, status, claimed_by FROM shifts ORDER BY id`;
    expect(rows.map((r) => [r.id, r.agency_id, r.role, r.d, r.s, r.e, r.status, r.claimed_by])).toEqual([
      ["shift-1", "agency-a", "RN", "2026-10-02", "19:00:00", "07:00:00", "open", null],
      ["shift-2", "agency-a", "LPN", "2026-10-03", "07:00:00", "19:00:00", "filled", "nurse-1"],
      ["shift-3", "agency-b", "RN", "2026-10-04", "19:00:00", "07:00:00", "open", null],
    ]);
  });

  it("loads the nurse license credentials (valid 2027-01-01, expired 2026-06-01)", async () => {
    const rows = await t.sql`SELECT nurse_id, type, expires_on::text AS exp, status, file_id FROM credentials ORDER BY nurse_id`;
    expect(rows.map((r) => [r.nurse_id, r.type, r.exp, r.status, r.file_id])).toEqual([
      ["nurse-1", "license", "2027-01-01", "verified", null],
      ["nurse-2", "license", "2026-06-01", "verified", null],
    ]);
  });

  it("adds only structure beyond the spec: one network, approvals, memberships, no facilities", async () => {
    expect(await count("hospital_networks")).toBe(1);
    expect(await count("network_agencies")).toBe(2);
    expect(await count("agency_memberships")).toBe(2);
    expect(await count("network_memberships")).toBe(1);
    expect(await count("nurse_profiles")).toBe(2);
    expect(await count("facilities")).toBe(0);
    expect(await count("audit_log")).toBe(0);
  });

  it("scopes each agency owner to their own agency", async () => {
    const rows = await t.sql`SELECT user_id, agency_id, role FROM agency_memberships ORDER BY user_id`;
    expect(rows.map((r) => [r.user_id, r.agency_id, r.role])).toEqual([
      ["agency-a", "agency-a", "owner"],
      ["agency-b", "agency-b", "owner"],
    ]);
  });

  it("leaves the id sequence so the next generated shift is shift-4", async () => {
    const [r] = await t.sql`INSERT INTO shifts (network_id, agency_id, role, shift_date, start_time, end_time, timezone, created_by)
      VALUES ('network-default', 'agency-a', 'RN', '2026-11-01', '07:00', '19:00', 'America/New_York', 'agency-a') RETURNING id`;
    expect(r?.id).toBe("shift-4");
  });
});

describe("seed: idempotency", () => {
  it("running again changes nothing and creates no duplicates", async () => {
    const tables = ["agencies", "users", "user_profiles", "nurse_profiles", "credentials", "shifts", "agency_memberships", "network_memberships", "network_agencies", "hospital_networks"];
    const before = await Promise.all(tables.map(count));
    const hashes = await t.sql`SELECT id, password_hash FROM users ORDER BY id`;
    await seed(t.db);
    await seed(t.db);
    expect(await Promise.all(tables.map(count))).toEqual(before);
    expect(await t.sql`SELECT id, password_hash FROM users ORDER BY id`).toEqual(hashes);
  });

  it("does not reset the sequence below rows created after the first seed", async () => {
    await seed(t.db);
    const [r] = await t.sql`INSERT INTO shifts (network_id, agency_id, role, shift_date, start_time, end_time, timezone, created_by)
      VALUES ('network-default', 'agency-a', 'RN', '2026-11-02', '07:00', '19:00', 'America/New_York', 'agency-a') RETURNING id`;
    expect(r?.id).toBe("shift-5");
  });
});
