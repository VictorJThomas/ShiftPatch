import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./test-db.js";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
}, 60_000);
afterAll(async () => {
  await t?.drop();
});

const EXPECTED_TABLES = [
  "agencies", "agency_memberships", "audit_log", "credentials", "facilities", "files", "hospital_networks", "inspection_packages",
  "network_agencies", "network_memberships", "notifications", "nurse_profiles", "refresh_tokens",
  "shift_cancellations", "shifts", "timesheets", "user_profiles", "users",
];

describe("migrations on a fresh database", () => {
  it("create every table from ARCHITECTURE §4.4", async () => {
    const rows = await t.sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name NOT LIKE '\\_\\_%' ORDER BY 1`;
    expect(rows.map((r) => r.table_name)).toEqual(EXPECTED_TABLES);
  });

  it("use ON DELETE RESTRICT/NO ACTION on every foreign key (rows are never hard-deleted while referenced)", async () => {
    const rows = await t.sql`SELECT conname, confdeltype FROM pg_constraint WHERE contype = 'f' AND confdeltype NOT IN ('r','a')`;
    expect(rows).toEqual([]);
  });

  it("use timestamptz for every timestamp column", async () => {
    const rows = await t.sql`SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'`;
    expect(rows).toEqual([]);
  });

  it("start generated shift ids after the seeds (shift-4)", async () => {
    const [r] = await t.sql`SELECT 'shift-' || nextval('shift_id_seq') AS id`;
    expect(r?.id).toBe("shift-4");
  });
});
