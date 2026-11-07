// GET /api/audit-logs against a real throwaway Postgres (ARCHITECTURE §4.5, §11). Rows come from the real writers
// (login, create, claim, cancel) and from `recordAudit` directly; no mocked repository or database.
import { type AuditLogEntry, AuditLogResponse } from "@shiftpatch/contracts";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import {
  agencies, agencyMemberships, auditLog, hospitalNetworks, networkAgencies, networkMemberships, shifts, userProfiles, users,
} from "../../db/schema/index.js";
import { seed } from "../../db/seed.js";
import { createTestDb } from "../../db/test-db.js";
import { REFRESH_COOKIE, signAccessToken } from "../auth/tokens.js";
import { recordAudit } from "./audit.js";

let t: Awaited<ReturnType<typeof createTestDb>>;
let app: FastifyInstance;
type Role = "agency" | "nurse" | "admin";
const roles = new Map<string, Role>([["agency-a", "agency"], ["agency-b", "agency"], ["nurse-1", "nurse"], ["nurse-2", "nurse"], ["admin-1", "admin"]]);

async function makeUser(id: string, role: Role) {
  await t.db.insert(users).values({ id, email: `${id}@example.com`, role, passwordHash: "x" });
  await t.db.insert(userProfiles).values({ userId: id, fullName: id });
  roles.set(id, role);
}
const member = (userId: string, agencyId: string, role: "owner" | "manager" | "viewer") =>
  t.db.insert(agencyMemberships).values({ id: `agm_${userId}_${agencyId}`, userId, agencyId, role });

beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db);
  process.env.DATABASE_URL = t.url;
  await t.db.insert(hospitalNetworks).values({ id: "network-2", name: "Second Network" });
  await t.db.insert(agencies).values({ id: "agency-c", name: "Gulf Staffing" });
  await t.db.insert(networkAgencies).values({ networkId: "network-2", agencyId: "agency-c" });
  await makeUser("owner-c", "agency"); await member("owner-c", "agency-c", "owner");
  await makeUser("viewer-a", "agency"); await member("viewer-a", "agency-a", "viewer");
  await makeUser("multi", "agency"); await member("multi", "agency-a", "owner"); await member("multi", "agency-b", "owner");
  await makeUser("admin-2", "admin");
  await t.db.insert(networkMemberships).values({ id: "nwm-admin-2", userId: "admin-2", networkId: "network-2" });
  await makeUser("admin-both", "admin");
  await t.db.insert(networkMemberships).values([
    { id: "nwm-both-1", userId: "admin-both", networkId: "network-default" }, { id: "nwm-both-2", userId: "admin-both", networkId: "network-2" },
  ]);
  await makeUser("admin-none", "admin"); // global admin role, no network membership
  await makeUser("admin-revoked", "admin");
  await t.db.insert(networkMemberships).values({ id: "nwm-rev", userId: "admin-revoked", networkId: "network-default", revokedAt: new Date() });
  app = buildApp();
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await t?.drop();
});

let ip = 0;
async function get(qs: string, who?: string, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { ...headers };
  if (who) h.authorization = `Bearer ${await signAccessToken({ id: who, role: roles.get(who)! })}`;
  const res = await app.inject({ method: "GET", url: `/api/audit-logs${qs}`, headers: h, remoteAddress: `10.3.0.${++ip % 250}` });
  return { status: res.statusCode, body: res.json() as { items: AuditLogEntry[]; nextCursor: string | null; error?: string } };
}
/** Follows nextCursor to the end. */
async function all(qs: string, who: string, headers: Record<string, string> = {}) {
  const items: AuditLogEntry[] = [];
  let cursor: string | null = null;
  do {
    const r = await get(`?limit=100${qs}${cursor ? `&cursor=${cursor}` : ""}`, who, headers);
    expect(r.status).toBe(200);
    items.push(...r.body.items);
    cursor = r.body.nextCursor;
  } while (cursor);
  return items;
}
const ins = (e: { networkId?: string | null; agencyId?: string | null; entityType: string; entityId?: string; action?: string; occurredAt?: Date; changes?: unknown }) =>
  recordAudit(t.db, {
    actorUserId: "admin-1", actorRole: "admin", networkId: e.networkId ?? null, agencyId: e.agencyId ?? null, action: e.action ?? "test.event",
    entityType: e.entityType, entityId: e.entityId ?? "e-1", requestId: "req-1", ip: "203.0.113.9", userAgent: "vitest",
    ...(e.occurredAt ? { occurredAt: e.occurredAt } : {}), ...(e.changes !== undefined ? { changes: e.changes } : {}),
  });
const err = (r: { status: number; body: unknown }, status: number, error: string) => expect(r).toMatchObject({ status, body: { error } });

describe("authorization and isolation", () => {
  beforeAll(async () => {
    await ins({ networkId: "network-default", agencyId: "agency-a", entityType: "iso", entityId: "iso-a" });
    await ins({ networkId: "network-default", agencyId: "agency-b", entityType: "iso", entityId: "iso-b" });
    await ins({ networkId: "network-2", agencyId: "agency-c", entityType: "iso", entityId: "iso-c" });
    await ins({ networkId: null, agencyId: null, entityType: "iso", entityId: "iso-unscoped" });
  });
  const ids = (items: AuditLogEntry[]) => items.map((i) => i.entityId).sort();

  it("401 without or with a bad token", async () => {
    err(await get(""), 401, "Unauthorized");
    const bad = await app.inject({ method: "GET", url: "/api/audit-logs", headers: { authorization: "Bearer nope" } });
    expect(bad.statusCode).toBe(401);
  });

  it("admin: the whole network (both agencies), never another network, never unscoped rows", async () => {
    const items = await all("&entityType=iso", "admin-1");
    expect(ids(items)).toEqual(["iso-a", "iso-b"]);
    expect(items.every((i) => i.networkId === "network-default")).toBe(true);
  });

  it("admin of another network sees only theirs", async () => {
    expect(ids(await all("&entityType=iso", "admin-2"))).toEqual(["iso-c"]);
  });

  it("admin of two networks sees both, still not unscoped rows", async () => {
    expect(ids(await all("&entityType=iso", "admin-both"))).toEqual(["iso-a", "iso-b", "iso-c"]);
  });

  it("admin cannot widen or switch the scope through the query (networkId / agencyId params are ignored)", async () => {
    expect(ids(await all("&entityType=iso&networkId=network-2&agencyId=agency-c", "admin-1"))).toEqual(["iso-a", "iso-b"]);
    err(await get("?entityType=iso", "admin-1", { "x-agency-id": "agency-c" }), 403, "Forbidden"); // header names no membership
  });

  it("admin role without an active network membership (none, or revoked): 403", async () => {
    err(await get("", "admin-none"), 403, "Forbidden");
    err(await get("", "admin-revoked"), 403, "Forbidden");
  });

  it("agency: only rows with its own agency_id, not the network, not a sibling agency", async () => {
    expect(ids(await all("&entityType=iso", "agency-a"))).toEqual(["iso-a"]);
    expect(ids(await all("&entityType=iso", "agency-b"))).toEqual(["iso-b"]);
    expect(ids(await all("&entityType=iso", "owner-c"))).toEqual(["iso-c"]);
  });

  it("agency cannot reach another agency's rows by entityId, agencyId param or header", async () => {
    expect((await get("?entityType=iso&entityId=iso-b", "agency-a")).body).toEqual({ items: [], nextCursor: null });
    expect(ids(await all("&entityType=iso&agencyId=agency-b&networkId=network-default", "agency-a"))).toEqual(["iso-a"]);
    err(await get("?entityType=iso", "agency-a", { "x-agency-id": "agency-b" }), 403, "Forbidden");
  });

  it("agency viewer is denied (least privilege, ARCHITECTURE §7.1)", async () => {
    err(await get("", "viewer-a"), 403, "Forbidden");
  });

  it("multi-agency user: 400 without a selected agency, exactly that agency's rows with the header", async () => {
    err(await get("", "multi"), 400, "Select an agency");
    expect(ids(await all("&entityType=iso", "multi", { "x-agency-id": "agency-b" }))).toEqual(["iso-b"]);
    expect(ids(await all("&entityType=iso", "multi", { "x-agency-id": "agency-a" }))).toEqual(["iso-a"]);
  });

  it("nurse is denied, even with a bad query (authorization answers before validation)", async () => {
    err(await get("", "nurse-1"), 403, "Forbidden");
    err(await get("?from=garbage&limit=0", "nurse-1"), 403, "Forbidden");
    err(await get("?entityId=iso-a", "nurse-2", { "x-agency-id": "agency-a" }), 403, "Forbidden");
  });

  it("authorization answers before ANY validation: bad cursor / inverted range never turns a 403 or a 400-select into a 400-invalid", async () => {
    const badCursor = "?cursor=!!!";
    const inverted = "?from=2030-01-03T00:00:00Z&to=2030-01-01T00:00:00Z";
    for (const qs of [badCursor, inverted]) {
      err(await get(qs, "nurse-1"), 403, "Forbidden");
      err(await get(qs, "viewer-a"), 403, "Forbidden");
      err(await get(qs, "admin-none"), 403, "Forbidden");
      err(await get(qs, "multi"), 400, "Select an agency");
      err(await get(qs, "admin-1"), 400, "Invalid query"); // an authorized caller does get the validation error
    }
  });
});

describe("filters, pagination, empty results", () => {
  const day = (n: number) => new Date(`2030-01-0${n}T12:00:00Z`);
  beforeAll(async () => {
    for (let n = 1; n <= 3; n++) await ins({ networkId: "network-default", agencyId: "agency-a", entityType: "flt", entityId: `f-${n}`, action: n === 2 ? "flt.two" : "flt.other", occurredAt: day(n) });
    await ins({ networkId: "network-default", agencyId: "agency-b", entityType: "flt", entityId: "f-b", action: "flt.other", occurredAt: day(2) });
    for (let n = 1; n <= 7; n++) await ins({ networkId: "network-default", agencyId: "agency-a", entityType: "pg", entityId: `p-${n}` });
  });
  const ids = (items: AuditLogEntry[]) => items.map((i) => i.entityId);

  it("entityType, entityId and action filter (and combine)", async () => {
    expect(ids(await all("&entityType=flt", "admin-1")).sort()).toEqual(["f-1", "f-2", "f-3", "f-b"]);
    expect(ids(await all("&entityType=flt&entityId=f-3", "admin-1"))).toEqual(["f-3"]);
    expect(ids(await all("&entityType=flt&action=flt.two", "admin-1"))).toEqual(["f-2"]);
    expect(ids(await all("&entityType=flt&action=flt.two", "agency-a"))).toEqual(["f-2"]);
    expect(await all("&entityType=flt&action=flt.two&entityId=f-1", "admin-1")).toEqual([]);
  });

  it("from / to are inclusive and combine with scope", async () => {
    expect(ids(await all(`&entityType=flt&from=${day(2).toISOString()}`, "admin-1")).sort()).toEqual(["f-2", "f-3", "f-b"]);
    expect(ids(await all(`&entityType=flt&to=${day(2).toISOString()}`, "admin-1")).sort()).toEqual(["f-1", "f-2", "f-b"]);
    expect(ids(await all(`&entityType=flt&from=${day(2).toISOString()}&to=${day(2).toISOString()}`, "agency-a"))).toEqual(["f-2"]);
    expect(await all("&entityType=flt&from=2031-01-01T00:00:00Z", "admin-1")).toEqual([]);
  });

  it("a timezone offset is honoured", async () => {
    // 2030-01-02T12:00Z == 2030-01-02T07:00-05:00
    expect(ids(await all("&entityType=flt&from=2030-01-02T07:00:00-05:00&to=2030-01-02T07:00:00-05:00", "agency-a"))).toEqual(["f-2"]);
  });

  it("newest first, pages of 3 + 3 + 1: no overlap, nothing skipped, shape { items, nextCursor }", async () => {
    const p1 = await get("?entityType=pg&limit=3", "admin-1");
    const p2 = await get(`?entityType=pg&limit=3&cursor=${p1.body.nextCursor}`, "admin-1");
    const p3 = await get(`?entityType=pg&limit=3&cursor=${p2.body.nextCursor}`, "admin-1");
    for (const p of [p1, p2, p3]) expect(AuditLogResponse.parse(p.body)).toBeTruthy();
    expect([p1, p2, p3].map((p) => p.body.items.length)).toEqual([3, 3, 1]);
    expect(p3.body.nextCursor).toBeNull();
    expect([...p1.body.items, ...p2.body.items, ...p3.body.items].map((i: AuditLogEntry) => i.entityId)).toEqual(["p-7", "p-6", "p-5", "p-4", "p-3", "p-2", "p-1"]);
  });

  it("a page that is exactly full has no next cursor; a new row between pages does not shift the next page", async () => {
    expect((await get("?entityType=pg&limit=7", "admin-1")).body.nextCursor).toBeNull();
    const p1 = await get("?entityType=pg&limit=3", "admin-1");
    await ins({ networkId: "network-default", agencyId: "agency-a", entityType: "pg", entityId: "p-late" });
    const p2 = await get(`?entityType=pg&limit=3&cursor=${p1.body.nextCursor}`, "admin-1");
    expect(p2.body.items.map((i: AuditLogEntry) => i.entityId)).toEqual(["p-4", "p-3", "p-2"]);
  });

  it("pagination stays inside the caller's scope (agency cursor never leaks another agency's rows)", async () => {
    const mine = await all("&entityType=flt", "agency-b");
    expect(ids(mine)).toEqual(["f-b"]);
    const p1 = await get("?entityType=flt&limit=1", "agency-a");
    const p2 = await get(`?entityType=flt&limit=1&cursor=${p1.body.nextCursor}`, "agency-a");
    expect([p1, p2].flatMap((p) => p.body.items.map((i: AuditLogEntry) => i.agencyId))).toEqual(["agency-a", "agency-a"]);
  });

  it("empty results are 200 { items: [], nextCursor: null }", async () => {
    expect((await get("?entityType=nothing-like-this", "admin-1")).body).toEqual({ items: [], nextCursor: null });
    expect((await get("?entityType=nothing-like-this", "agency-a")).body).toEqual({ items: [], nextCursor: null });
  });

  it("invalid query: 400 { error }", async () => {
    for (const qs of ["?from=yesterday", "?to=2030-13-45", "?cursor=!!!", `?cursor=${Buffer.from("-5").toString("base64url")}`, "?limit=0", "?limit=101", "?limit=abc",
      "?from=2030-01-03T00:00:00Z&to=2030-01-01T00:00:00Z", "?entityType=a&entityType=b"]) {
      err(await get(qs, "admin-1"), 400, "Invalid query");
    }
  });

  it("the response never carries ip or user agent", async () => {
    const row = (await get("?entityType=flt&limit=1", "admin-1")).body.items[0]!;
    expect(Object.keys(row).sort()).toEqual(["action", "actorRole", "actorUserId", "agencyId", "changes", "entityId", "entityType", "id", "networkId", "occurredAt", "requestId"]);
  });
});

describe("redaction", () => {
  const dirty = {
    status: ["open", "filled"],
    password: ["a", "b"], passwordHash: [null, "$argon2id$..."], refreshToken: [null, "rt_secret"], accessToken: "x", tokenHash: "y",
    downloadUrl: [null, "https://minio/bucket/key?X-Amz-Signature=abc"], fileKey: [null, "files/abc.pdf"], objectKey: "k", storageKey: "k", signedUrl: "u",
    authorization: "Bearer zzz", apiKey: "k",
    nested: { clientSecret: "s", ok: "fine", deep: [{ s3Key: "k", objectKey: "k", note: "kept" }] },
    filePath: "docs/abc.pdf", s3Uri: "s3-bucket-uri", objectKeys: ["a", "b"], passcode: "1234", otp: "999", file_path: "x", "download-url": "x",
    linkedShiftId: ["shift-1", "shift-2"], unlinked: false,
    note: ["x", "https://example.com/doc.pdf?sig=1"], jwt: ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123"],
  };

  it("sensitive fields are stripped when read, even from a row written without the writer's redaction", async () => {
    await t.db.insert(auditLog).values({ action: "redact.raw", entityType: "red", entityId: "raw", networkId: "network-default", agencyId: "agency-a", changes: dirty });
    const row = (await get("?entityType=red&entityId=raw", "admin-1")).body.items[0]!;
    const changes = row.changes as { status: unknown; nested: { ok: string; deep: unknown[] }; note: unknown };
    const text = JSON.stringify(changes);
    for (const leak of ["argon2", "rt_secret", "X-Amz", "files/abc.pdf", "Bearer zzz", "example.com", "eyJ", "clientSecret", "objectKey", "fileKey", "downloadUrl", "signedUrl", "password", "tokenHash", "storageKey", "apiKey", "filePath", "s3Uri", "objectKeys", "passcode", "otp", "file_path", "download-url"]) {
      expect(text).not.toContain(leak);
    }
    expect(changes.status).toEqual(["open", "filled"]);
    expect(changes.nested.ok).toBe("fine");
    expect(changes.nested.deep[0]).toEqual({ note: "kept" });
    expect(changes.note).toEqual(["x", "[redacted]"]);
    expect(changes).toMatchObject({ linkedShiftId: ["shift-1", "shift-2"], unlinked: false }); // word match, not substring: legitimate fields survive
    const agencyRow = (await get("?entityType=red&entityId=raw", "agency-a")).body.items[0]!;
    expect(agencyRow.changes).toEqual(row.changes);
  });

  it("recordAudit strips them before they are stored", async () => {
    await ins({ networkId: "network-default", agencyId: "agency-a", entityType: "red", entityId: "written", changes: dirty });
    const [stored] = await t.db.select().from(auditLog).where(eq(auditLog.entityId, "written"));
    const text = JSON.stringify(stored!.changes);
    for (const leak of ["argon2", "rt_secret", "X-Amz", "files/abc.pdf", "example.com", "password", "fileKey"]) expect(text).not.toContain(leak);
    expect((stored!.changes as Record<string, unknown>).status).toEqual(["open", "filled"]);
  });

  it("a __proto__ key in stored json never reaches the response", async () => {
    await t.db.insert(auditLog).values({
      action: "redact.proto", entityType: "red", entityId: "proto", networkId: "network-default",
      changes: JSON.parse('{"__proto__":{"polluted":"yes"},"status":["a","b"]}'),
    });
    const changes = (await get("?entityType=red&entityId=proto", "admin-1")).body.items[0]!.changes;
    expect(changes).toEqual({ status: ["a", "b"] });
    expect(({} as { polluted?: string }).polluted).toBeUndefined();
  });

  it("changes that are not an object come back as null", async () => {
    await t.db.insert(auditLog).values({ action: "redact.odd", entityType: "red", entityId: "odd", networkId: "network-default", changes: ["a", "b"] });
    expect((await get("?entityType=red&entityId=odd", "admin-1")).body.items[0]!.changes).toBeNull();
  });
});

describe("immutability", () => {
  it("UPDATE, DELETE and TRUNCATE are rejected by the database, for every role", async () => {
    await ins({ networkId: "network-default", entityType: "imm", entityId: "imm-1" });
    await expect(t.db.update(auditLog).set({ action: "tampered" }).where(eq(auditLog.entityType, "imm"))).rejects.toThrow();
    await expect(t.db.delete(auditLog).where(eq(auditLog.entityType, "imm"))).rejects.toThrow();
    await expect(t.db.execute(sql`TRUNCATE audit_log`)).rejects.toThrow();
    expect(await t.db.select().from(auditLog).where(eq(auditLog.entityType, "imm"))).toHaveLength(1);
  });

  it("the API has no write route for the log: POST / PUT / PATCH / DELETE are 404", async () => {
    const token = await signAccessToken({ id: "admin-1", role: "admin" });
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      for (const url of ["/api/audit-logs", "/api/audit-logs/1"]) {
        const r = await app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: {} });
        expect(r.statusCode).toBe(404);
      }
    }
  });
});

describe("one audit model across the real writers (login, create, claim, cancel)", () => {
  const post = async (url: string, who: string, body?: unknown) =>
    app.inject({
      method: "POST", url, remoteAddress: `10.4.0.${++ip % 250}`, payload: (body ?? {}) as object,
      headers: { authorization: `Bearer ${await signAccessToken({ id: who, role: roles.get(who)! })}` },
    });
  const login = (email: string) =>
    app.inject({ method: "POST", url: "/api/auth/login", remoteAddress: `10.5.0.${++ip % 250}`, payload: { email, password: "Trial2026!" } });

  it("login rows carry the user's network and agency, so the reader can scope them", async () => {
    for (const email of ["admin@sunrisehealth.example", "alex.kim@example.com", "maria.lopez@example.com"]) expect((await login(email)).statusCode).toBe(200);
    const adminSees = await all("&action=auth.login", "admin-1");
    const byUser = new Map(adminSees.map((i) => [i.actorUserId, i]));
    expect(byUser.get("agency-a")).toMatchObject({ networkId: "network-default", agencyId: "agency-a", actorRole: "agency", entityType: "user", entityId: "agency-a" });
    expect(byUser.get("admin-1")).toMatchObject({ networkId: "network-default", agencyId: null, actorRole: "admin" });
    expect(byUser.get("nurse-1")).toMatchObject({ networkId: "network-default", agencyId: null, actorRole: "nurse" });
    // the agency sees its own login, not the nurse's or the admin's
    const agencySees = await all("&action=auth.login", "agency-a");
    expect(agencySees.map((i) => i.actorUserId)).toEqual(["agency-a"]);
    // network-2's admin sees none of it
    expect(await all("&action=auth.login", "admin-2")).toEqual([]);
    // every login row has a request id and the same column set as any other writer
    expect(adminSees.every((i) => typeof i.requestId === "string" && i.requestId.length > 0)).toBe(true);
  });

  it("failed logins are unscoped: visible to nobody through this API, and hold no raw email", async () => {
    await app.inject({ method: "POST", url: "/api/auth/login", remoteAddress: "10.5.9.9", payload: { email: "ghost@example.com", password: "nope-nope" } });
    expect(await all("&action=auth.login_failed", "admin-1")).toEqual([]);
    const [row] = await t.db.select().from(auditLog).where(eq(auditLog.action, "auth.login_failed"));
    expect(JSON.stringify(row)).not.toContain("ghost@example.com");
  });

  it("logout and refresh-reuse rows carry role + network/agency like login, so scoped readers see them", async () => {
    const session = async (email: string) => {
      const res = await login(email);
      expect(res.statusCode).toBe(200);
      return res.cookies.find((c) => c.name === REFRESH_COOKIE)!.value;
    };
    const cookies = (v: string) => ({ [REFRESH_COOKIE]: v });
    // agency: logout
    const agencyTok = await session("admin@sunrisehealth.example");
    const out = await app.inject({ method: "POST", url: "/api/auth/logout", remoteAddress: `10.6.0.${++ip % 250}`, cookies: cookies(agencyTok) });
    expect(out.statusCode).toBe(204);
    // nurse: rotate, backdate the old token past the grace window, replay it -> reuse detected
    const nurseTok = await session("maria.lopez@example.com");
    const rotated = await app.inject({ method: "POST", url: "/api/auth/refresh", remoteAddress: `10.6.0.${++ip % 250}`, cookies: cookies(nurseTok) });
    expect(rotated.statusCode).toBe(200);
    await t.db.execute(sql`UPDATE refresh_tokens SET revoked_at = now() - interval '60 seconds' WHERE user_id = 'nurse-1' AND replaced_by IS NOT NULL`);
    const replay = await app.inject({ method: "POST", url: "/api/auth/refresh", remoteAddress: `10.6.0.${++ip % 250}`, cookies: cookies(nurseTok) });
    expect(replay.statusCode).toBe(401);

    const logoutRows = await all("&action=auth.logout", "admin-1");
    expect(logoutRows).toHaveLength(1);
    expect(logoutRows[0]).toMatchObject({ actorUserId: "agency-a", actorRole: "agency", networkId: "network-default", agencyId: "agency-a" });
    expect((await all("&action=auth.logout", "agency-a")).map((i) => i.actorUserId)).toEqual(["agency-a"]);
    expect(await all("&action=auth.logout", "admin-2")).toEqual([]);

    const reuseRows = await all("&action=auth.refresh_reuse_detected", "admin-1");
    expect(reuseRows).toHaveLength(1);
    expect(reuseRows[0]).toMatchObject({ actorUserId: "nurse-1", actorRole: "nurse", networkId: "network-default", agencyId: null });
    expect(await all("&action=auth.refresh_reuse_detected", "agency-a")).toEqual([]); // nurse events are network-level
  });

  it("shift.created -> shift.claimed -> shift.cancelled: same columns, readable by the owning agency and the network admin, hidden from others", async () => {
    const created = await post("/api/shifts", "agency-a", { role: "RN", date: "2026-12-05", startTime: "07:00", endTime: "19:00" });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;
    expect((await post(`/api/shifts/${id}/claim`, "nurse-1")).statusCode).toBe(200);
    expect((await post(`/api/shifts/${id}/cancel`, "nurse-1", { reason: "advance" })).statusCode).toBe(200);

    for (const who of ["agency-a", "admin-1"]) {
      const items = (await all(`&entityType=shift&entityId=${id}`, who)).reverse(); // oldest first
      expect(items.map((i) => i.action)).toEqual(["shift.created", "shift.claimed", "shift.cancelled"]);
      for (const i of items) expect(i).toMatchObject({ entityType: "shift", entityId: id, networkId: "network-default", agencyId: "agency-a" });
      expect(items.map((i) => i.actorUserId)).toEqual(["agency-a", "nurse-1", "nurse-1"]);
      expect(items.map((i) => i.actorRole)).toEqual(["agency", "nurse", "nurse"]);
      expect(items.every((i) => typeof i.requestId === "string" && i.requestId.length > 0)).toBe(true);
      expect(items[0]!.changes).toMatchObject({ status: [null, "open"], role: [null, "RN"], date: [null, "2026-12-05"] });
      expect(items[1]!.changes).toEqual({ status: ["open", "filled"], claimedBy: [null, "nurse-1"] });
      expect(items[2]!.changes).toEqual({ status: ["filled", "open"], claimedBy: ["nurse-1", null], reason: "advance" });
      AuditLogResponse.parse({ items, nextCursor: null });
    }
    expect(await all(`&entityType=shift&entityId=${id}`, "agency-b")).toEqual([]);
    expect(await all(`&entityType=shift&entityId=${id}`, "admin-2")).toEqual([]);
    err(await get(`?entityId=${id}`, "nurse-1"), 403, "Forbidden");
  });

  it("a rolled-back create leaves no audit row (same transaction)", async () => {
    const before = (await t.db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(eq(auditLog.action, "shift.created")))[0]!.n;
    const bad = await post("/api/shifts", "agency-a", { role: "RN", date: "2026-12-06", startTime: "07:00", endTime: "07:00" }); // rejected by validation
    expect(bad.statusCode).toBe(400);
    expect((await t.db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(eq(auditLog.action, "shift.created")))[0]!.n).toBe(before);
  });

  it("a soft-deleted shift keeps its history for the owning scope; the foreign agency still sees nothing", async () => {
    const created = await post("/api/shifts", "agency-a", { role: "LPN", date: "2026-12-07", startTime: "07:00", endTime: "19:00" });
    const id = (created.json() as { id: string }).id;
    await t.db.update(shifts).set({ deletedAt: new Date() }).where(eq(shifts.id, id));
    expect((await all(`&entityId=${id}`, "agency-a")).map((i) => i.action)).toEqual(["shift.created"]);
    expect((await all(`&entityId=${id}`, "admin-1")).map((i) => i.action)).toEqual(["shift.created"]);
    expect(await all(`&entityId=${id}`, "agency-b")).toEqual([]);
    expect(await all(`&entityId=${id}`, "admin-2")).toEqual([]);
  });

  it("an unknown or foreign entity id is an empty page, not a 404 (existence is not revealed)", async () => {
    expect((await get("?entityType=shift&entityId=shift-does-not-exist", "agency-a")).body).toEqual({ items: [], nextCursor: null });
  });
});
