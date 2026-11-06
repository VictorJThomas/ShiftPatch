import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./test-db.js";

let t: Awaited<ReturnType<typeof createTestDb>>;
let sql: typeof t.sql;

beforeAll(async () => {
  t = await createTestDb();
  sql = t.sql;
  await t.sql`INSERT INTO hospital_networks (id, name) VALUES ('net-1', 'Net 1'), ('net-2', 'Net 2')`;
  await t.sql`INSERT INTO agencies (id, name) VALUES ('ag-a', 'Agency A'), ('ag-b', 'Agency B')`;
  await t.sql`INSERT INTO network_agencies (network_id, agency_id) VALUES ('net-1', 'ag-a'), ('net-1', 'ag-b')`; // ag-* not in net-2
  await t.sql`INSERT INTO users (id, email, password_hash, role) VALUES
    ('u-nurse1', 'n1@x.test', 'h', 'nurse'), ('u-nurse2', 'n2@x.test', 'h', 'nurse'), ('u-ag', 'ag@x.test', 'h', 'agency')`;
  await t.sql`INSERT INTO nurse_profiles (user_id, network_id) VALUES ('u-nurse1', 'net-1'), ('u-nurse2', 'net-1')`;
}, 60_000);
afterAll(async () => {
  await t?.drop();
});

/** Insert a shift with sane defaults; `over` replaces column values. */
async function shift(over: Record<string, unknown> = {}) {
  const row = {
    network_id: "net-1", agency_id: "ag-a", role: "RN", shift_date: "2026-10-02", start_time: "19:00",
    end_time: "07:00", timezone: "America/New_York", created_by: "u-ag", ...over,
  };
  return sql`INSERT INTO shifts ${sql(row)} RETURNING id`;
}

describe("shifts", () => {
  it("generates readable ids from the sequence (shift-<n>)", async () => {
    const [r] = await shift();
    expect(r?.id).toMatch(/^shift-\d+$/);
  });

  it("rejects filled without a nurse (core rule)", async () => {
    await expect(shift({ status: "filled", claimed_at: new Date().toISOString() })).rejects.toThrow(/shifts_filled_iff_claimed/);
  });

  it("rejects a nurse on a shift that is not filled", async () => {
    await expect(shift({ status: "open", claimed_by: "u-nurse1" })).rejects.toThrow(/shifts_filled_iff_claimed/);
  });

  it("rejects filled without claimed_at", async () => {
    await expect(shift({ status: "filled", claimed_by: "u-nurse1" })).rejects.toThrow(/shifts_filled_has_claimed_at/);
  });

  it("accepts a correctly filled shift", async () => {
    await expect(shift({ status: "filled", claimed_by: "u-nurse1", claimed_at: new Date().toISOString() })).resolves.toHaveLength(1);
  });

  it("rejects an unknown role, equal start/end and negative pay", async () => {
    await expect(shift({ role: "MD" })).rejects.toThrow(/shifts_role_valid/);
    await expect(shift({ start_time: "07:00", end_time: "07:00" })).rejects.toThrow(/shifts_times_differ/);
    await expect(shift({ pay_rate_cents: -1 })).rejects.toThrow(/shifts_pay_nonneg/);
  });

  it("isolates networks: an agency can only post in a network that approved it", async () => {
    await expect(shift({ network_id: "net-2" })).rejects.toThrow(/shifts_network_agency_fk/);
  });

  it("lets exactly one of 20 parallel claims win (atomic UPDATE ... WHERE status='open')", async () => {
    const [{ id }] = (await shift()) as unknown as [{ id: string }];
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        sql`UPDATE shifts SET status = 'filled', claimed_by = ${i % 2 ? "u-nurse1" : "u-nurse2"}, claimed_at = now()
            WHERE id = ${id} AND status = 'open' RETURNING id`,
      ),
    );
    expect(results.filter((r) => r.length === 1)).toHaveLength(1);
    const [row] = await sql`SELECT status, claimed_by FROM shifts WHERE id = ${id}`;
    expect(row?.status).toBe("filled");
    expect(row?.claimed_by).not.toBeNull();
  });
});

describe("users and memberships", () => {
  it("rejects a duplicate email regardless of case, and a non-lowercase email", async () => {
    await expect(sql`INSERT INTO users (id, email, password_hash, role) VALUES ('u-dup', 'N1@X.test', 'h', 'nurse')`).rejects.toThrow(/users_email_lowercase/);
    await expect(sql`INSERT INTO users (id, email, password_hash, role) VALUES ('u-dup', 'n1@x.test', 'h', 'nurse')`).rejects.toThrow(/users_email_uq/);
  });

  it("lets a soft-deleted user's email be registered again", async () => {
    await sql`INSERT INTO users (id, email, password_hash, role, deleted_at) VALUES ('u-old', 'reuse@x.test', 'h', 'nurse', now())`;
    await expect(sql`INSERT INTO users (id, email, password_hash, role) VALUES ('u-new', 'reuse@x.test', 'h', 'nurse')`).resolves.toBeDefined();
  });

  it("allows one active agency membership per user+agency, but history after revoke", async () => {
    await sql`INSERT INTO agency_memberships (id, user_id, agency_id, role) VALUES ('m1', 'u-ag', 'ag-a', 'owner')`;
    await expect(sql`INSERT INTO agency_memberships (id, user_id, agency_id, role) VALUES ('m2', 'u-ag', 'ag-a', 'viewer')`).rejects.toThrow(/agency_memberships_active_uq/);
    await sql`UPDATE agency_memberships SET revoked_at = now(), revoked_by = 'u-ag' WHERE id = 'm1'`;
    await expect(sql`INSERT INTO agency_memberships (id, user_id, agency_id, role) VALUES ('m3', 'u-ag', 'ag-a', 'viewer')`).resolves.toBeDefined();
    await expect(sql`INSERT INTO agency_memberships (id, user_id, agency_id, role) VALUES ('m4', 'u-ag', 'ag-b', 'owner')`).resolves.toBeDefined(); // other agency unaffected
  });

  it("requires revoked_at and revoked_by together", async () => {
    await expect(sql`UPDATE agency_memberships SET revoked_at = now() WHERE id = 'm4'`).rejects.toThrow(/agency_memberships_revoked_pair/);
  });

  it("restricts deleting a referenced user", async () => {
    await expect(sql`DELETE FROM users WHERE id = 'u-ag'`).rejects.toThrow(/foreign key/);
  });
});

describe("credentials", () => {
  const cred = (over: Record<string, unknown>) => {
    const row = { id: `c-${Math.random()}`, nurse_id: "u-nurse1", type: "license", expires_on: "2027-01-01", ...over };
    return sql`INSERT INTO credentials ${sql(row)}`;
  };

  it("requires an expiry on licenses and a screening date on TB records", async () => {
    await expect(cred({ expires_on: null })).rejects.toThrow(/credentials_license_needs_expiry/);
    await expect(cred({ type: "tb_screening", expires_on: null })).rejects.toThrow(/credentials_tb_needs_screened_on/);
    await expect(cred({ type: "tb_screening", expires_on: null, screened_on: "2026-01-01" })).resolves.toBeDefined();
  });

  it("rejects expiry before issue date", async () => {
    await expect(cred({ issued_on: "2027-02-01" })).rejects.toThrow(/credentials_expiry_after_issue/);
  });

  it("ties reviewed_at to a non-pending status", async () => {
    await expect(cred({ status: "verified" })).rejects.toThrow(/credentials_reviewed_iff_not_pending/);
    await expect(cred({ status: "verified", reviewed_at: new Date().toISOString() })).resolves.toBeDefined();
    await expect(cred({ status: "pending", reviewed_at: new Date().toISOString() })).rejects.toThrow(/credentials_reviewed_iff_not_pending/);
  });
});

describe("files", () => {
  it("enforces the 10 MB limit and unique (bucket, object_key)", async () => {
    const f = (id: string, size: number, key = "k1") =>
      sql`INSERT INTO files (id, bucket, object_key, mime_type, size_bytes, sha256, uploaded_by)
          VALUES (${id}, 'private_credentials', ${key}, 'application/pdf', ${size}, ${"a".repeat(64)}, 'u-nurse1')`;
    await expect(f("f0", 0)).rejects.toThrow(/files_size_range/);
    await expect(f("f0", 10_485_761)).rejects.toThrow(/files_size_range/);
    await f("f1", 10_485_760);
    await expect(f("f2", 5)).rejects.toThrow(/files_bucket_key_uq/);
  });
});

describe("audit_log is append-only", () => {
  it("allows INSERT but blocks UPDATE and DELETE", async () => {
    const [r] = await sql`INSERT INTO audit_log (action, entity_type, entity_id) VALUES ('shift.claimed', 'shift', 'shift-1') RETURNING id`;
    await expect(sql`UPDATE audit_log SET action = 'tampered' WHERE id = ${r!.id}`).rejects.toThrow(/append-only/);
    await expect(sql`DELETE FROM audit_log WHERE id = ${r!.id}`).rejects.toThrow(/append-only/);
  });

  it("blocks TRUNCATE", async () => {
    await expect(sql`TRUNCATE audit_log`).rejects.toThrow(/append-only/);
  });
});
