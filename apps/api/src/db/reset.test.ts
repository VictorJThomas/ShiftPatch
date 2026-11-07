import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { assertLocalDatabase, resetDatabase } from "./reset.js";

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://shiftpatch:shiftpatch@localhost:5432/postgres";

describe("db:reset guard", () => {
  it.each([
    ["remote host", "postgres://u:p@api.railway.internal:5432/shiftpatch"],
    ["public proxy", "postgres://u:p@roundhouse.proxy.rlwy.net:41234/railway"],
    ["non-shiftpatch db", "postgres://u:p@localhost:5432/postgres"],
    ["quote injection", 'postgres://u:p@localhost:5432/shiftpatch"; DROP'],
    ["not a url", "nope"],
  ])("refuses %s", (_label, url) => {
    expect(() => assertLocalDatabase(url, {})).toThrow(/db:reset refused/);
  });

  it("refuses a local URL inside a deployed environment", () => {
    expect(() => assertLocalDatabase("postgres://u:p@localhost:5432/shiftpatch", { RAILWAY_ENVIRONMENT: "production" })).toThrow(
      /deployed environment/,
    );
    expect(() => assertLocalDatabase("postgres://u:p@localhost:5432/shiftpatch", { NODE_ENV: "production" })).toThrow();
  });

  it("accepts the local dev and suffixed databases", () => {
    expect(assertLocalDatabase("postgres://u:p@localhost:5432/shiftpatch", {})).toEqual({ dbName: "shiftpatch" });
    expect(assertLocalDatabase("postgres://u:p@127.0.0.1:5432/shiftpatch_qa", {})).toEqual({ dbName: "shiftpatch_qa" });
  });
});

describe("db:reset restores the exact spec seed", () => {
  const name = `shiftpatch_reset_${randomBytes(4).toString("hex")}`;
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const target = url.toString();

  afterAll(async () => {
    const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  });

  it("reopens a claimed shift-1 and removes extra rows, twice in a row", async () => {
    await resetDatabase(target);
    const sql = postgres(target, { max: 1 });
    try {
      // Mutate like a QA run would: claim shift-1, add a shift and an audit row.
      await sql`UPDATE shifts SET status = 'filled', claimed_by = 'nurse-1', claimed_at = now() WHERE id = 'shift-1'`;
      await sql`INSERT INTO shifts (id, network_id, agency_id, created_by, role, shift_date, start_time, end_time, timezone, status)
                VALUES ('shift-4', 'network-default', 'agency-a', 'agency-a', 'RN', '2026-12-01', '07:00', '19:00', 'America/New_York', 'open')`;
    } finally {
      await sql.end();
    }

    for (let run = 0; run < 2; run++) {
      await resetDatabase(target);
      const check = postgres(target, { max: 1 });
      try {
        const shifts = await check`SELECT id, status, claimed_by FROM shifts ORDER BY id`;
        expect(shifts.map((r) => [r.id, r.status, r.claimed_by])).toEqual([
          ["shift-1", "open", null],
          ["shift-2", "filled", "nurse-1"],
          ["shift-3", "open", null],
        ]);
        expect(Number((await check`SELECT count(*)::int AS n FROM users`)[0]!.n)).toBe(5);
        expect(Number((await check`SELECT count(*)::int AS n FROM audit_log`)[0]!.n)).toBe(0);
      } finally {
        await check.end();
      }
    }
  }, 120_000);
});
