// Contract tests for the 6 required routes (docs/original/ShiftPatch-Technical-Spec.md).
// Exact keys via the strict schemas in @shiftpatch/contracts, exact error texts, seeded spec data.
//
// Each route block is skipped until its handler is registered (app.hasRoute), so this gate goes live
// route by route in stages 3-4 without being red before the handlers exist. Vitest prints them as skipped.
// Tests share one seeded DB and run in file order: read-only checks first, then writes.
import {
  AgencyShiftsResponse,
  CancelShiftResponse,
  ClaimShiftResponse,
  CreateShiftResponse,
  ErrorBody,
  ErrorMessage,
  ListShiftsResponse,
  LoginResponse,
} from "@shiftpatch/contracts";
import type { FastifyInstance, HTTPMethods } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { seed } from "../db/seed.js";
import { createTestDb } from "../db/test-db.js";

const PASSWORD = "Trial2026!";
const EMAIL = {
  "nurse-1": "maria.lopez@example.com",
  "nurse-2": "james.cook@example.com",
  "agency-a": "admin@sunrisehealth.example",
  "agency-b": "admin@metrocare.example",
  "admin-1": "alex.kim@example.com",
} as const;
type Who = keyof typeof EMAIL;

const SEED_SHIFTS = [
  { id: "shift-1", agencyId: "agency-a", agencyName: "Sunrise Health Staffing", role: "RN", date: "2026-10-02", startTime: "19:00", endTime: "07:00", status: "open", claimedBy: null },
  { id: "shift-2", agencyId: "agency-a", agencyName: "Sunrise Health Staffing", role: "LPN", date: "2026-10-03", startTime: "07:00", endTime: "19:00", status: "filled", claimedBy: "nurse-1" },
  { id: "shift-3", agencyId: "agency-b", agencyName: "Metro Care Partners", role: "RN", date: "2026-10-04", startTime: "19:00", endTime: "07:00", status: "open", claimedBy: null },
];

// Route registry probe: built once, no DB needed to read the route table.
const probe = buildApp();
await probe.ready();
const has = (method: HTTPMethods, url: string) => probe.hasRoute({ method, url });
await probe.close();

const LOGIN = has("POST", "/api/auth/login");
const live = (method: HTTPMethods, url: string) => LOGIN && has(method, url); // routes 2-6 need a token

let app: FastifyInstance;
let dropDb: (() => Promise<void>) | undefined;

beforeAll(async () => {
  const t = await createTestDb();
  dropDb = t.drop;
  await seed(t.db);
  process.env.DATABASE_URL = t.url; // handlers read their DB from env, like production
  app = buildApp();
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await dropDb?.();
});

async function call(method: HTTPMethods, url: string, opts: { who?: Who; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (opts.who) headers.authorization = `Bearer ${await token(opts.who)}`;
  const res = await app.inject({ method, url, headers, ...(opts.body === undefined ? {} : { payload: opts.body as object }) });
  return { status: res.statusCode, body: res.json() as unknown };
}

const tokens = new Map<Who, string>();
async function token(who: Who) {
  if (!tokens.has(who)) {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: EMAIL[who], password: PASSWORD } });
    tokens.set(who, LoginResponse.parse(res.json()).token);
  }
  return tokens.get(who)!;
}

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id, "en", { numeric: true });

function expectError(r: { status: number; body: unknown }, status: number, text?: string) {
  expect(r.status).toBe(status);
  const body = ErrorBody.parse(r.body); // exactly { error: non-empty string }
  if (text) expect(body.error).toBe(text);
}

describe.skipIf(!LOGIN)("1. POST /api/auth/login", () => {
  it.each([
    ["nurse-1", "Maria Lopez", "nurse"],
    ["agency-a", "Sunrise Health Staffing", "agency"],
    ["admin-1", "Alex Kim", "admin"],
  ] as const)("200 for %s with the exact shape", async (id, name, role) => {
    const r = await call("POST", "/api/auth/login", { body: { email: EMAIL[id], password: PASSWORD } });
    expect(r.status).toBe(200);
    expect(LoginResponse.parse(r.body).user).toEqual({ id, name, role });
  });

  it("401 exact text for a wrong password and for an unknown email", async () => {
    expectError(await call("POST", "/api/auth/login", { body: { email: EMAIL["nurse-1"], password: "nope" } }), 401, ErrorMessage.invalidCredentials);
    expectError(await call("POST", "/api/auth/login", { body: { email: "nobody@example.com", password: PASSWORD } }), 401, ErrorMessage.invalidCredentials);
  });
});

describe.skipIf(!live("GET", "/api/shifts"))("2. GET /api/shifts", () => {
  it("401 without a token", async () => {
    expectError(await call("GET", "/api/shifts"), 401, ErrorMessage.unauthorized);
  });

  it("200 lists every seeded shift across both agencies, exact shape", async () => {
    const r = await call("GET", "/api/shifts", { who: "nurse-1" });
    expect(r.status).toBe(200);
    expect(ListShiftsResponse.parse(r.body).shifts.sort(byId)).toEqual(SEED_SHIFTS);
  });
});

describe.skipIf(!live("GET", "/api/agencies/:agencyId/shifts"))("6. GET /api/agencies/:agencyId/shifts", () => {
  it("agency-a sees shift-1 and shift-2", async () => {
    const r = await call("GET", "/api/agencies/agency-a/shifts", { who: "agency-a" });
    expect(r.status).toBe(200);
    const body = AgencyShiftsResponse.parse(r.body);
    expect(body.agencyId).toBe("agency-a");
    expect(body.shifts.sort(byId)).toEqual(SEED_SHIFTS.slice(0, 2));
  });

  it("agency-b sees shift-3 only", async () => {
    const r = await call("GET", "/api/agencies/agency-b/shifts", { who: "agency-b" });
    expect(r.status).toBe(200);
    expect(AgencyShiftsResponse.parse(r.body)).toEqual({ agencyId: "agency-b", shifts: [SEED_SHIFTS[2]] });
  });

  it("403 for another agency, 401 without a token", async () => {
    expectError(await call("GET", "/api/agencies/agency-a/shifts", { who: "agency-b" }), 403, ErrorMessage.forbidden);
    expectError(await call("GET", "/api/agencies/agency-a/shifts"), 401, ErrorMessage.unauthorized);
  });
});

describe.skipIf(!live("POST", "/api/shifts"))("3. POST /api/shifts", () => {
  const body = { role: "RN", date: "2026-10-05", startTime: "07:00", endTime: "19:00" };

  it("201 open shift scoped to the caller's agency (body agencyId ignored)", async () => {
    const r = await call("POST", "/api/shifts", { who: "agency-a", body: { ...body, agencyId: "agency-b" } });
    expect(r.status).toBe(201);
    const s = CreateShiftResponse.parse(r.body);
    expect(s).toMatchObject({ ...body, agencyId: "agency-a", agencyName: "Sunrise Health Staffing", status: "open", claimedBy: null });
    expect(s.id).toMatch(/^shift-\d+$/); // spec's "shift-7" is illustrative, not asserted
  });

  it("400 { error } for an invalid body", async () => {
    expectError(await call("POST", "/api/shifts", { who: "agency-a", body: { ...body, startTime: "7am" } }), 400);
  });

  it("403 for a nurse, 401 without a token", async () => {
    expectError(await call("POST", "/api/shifts", { who: "nurse-1", body }), 403);
    expectError(await call("POST", "/api/shifts", { body }), 401, ErrorMessage.unauthorized);
  });
});

describe.skipIf(!live("POST", "/api/shifts/:id/claim"))("4. POST /api/shifts/:id/claim", () => {
  it("403 exact text for nurse-2 (expired credential)", async () => {
    expectError(await call("POST", "/api/shifts/shift-1/claim", { who: "nurse-2" }), 403, ErrorMessage.credentialExpired);
  });

  it("200 nurse-1 claims shift-1, exact spec response", async () => {
    const r = await call("POST", "/api/shifts/shift-1/claim", { who: "nurse-1" });
    expect(r.status).toBe(200);
    expect(ClaimShiftResponse.parse(r.body)).toEqual({ ...SEED_SHIFTS[0], status: "filled", claimedBy: "nurse-1" });
  });

  it("409 when the shift is no longer open, 404 for an unknown shift, 401 without a token", async () => {
    expectError(await call("POST", "/api/shifts/shift-1/claim", { who: "nurse-1" }), 409);
    expectError(await call("POST", "/api/shifts/shift-999/claim", { who: "nurse-1" }), 404);
    expectError(await call("POST", "/api/shifts/shift-3/claim"), 401, ErrorMessage.unauthorized);
  });
});

describe.skipIf(!live("POST", "/api/shifts/:id/cancel"))("5. POST /api/shifts/:id/cancel", () => {
  it("400 for an invalid reason", async () => {
    expectError(await call("POST", "/api/shifts/shift-2/cancel", { who: "agency-a", body: { reason: "sick" } }), 400);
  });

  it("200 no-show on shift-2 reopens it, exact spec response", async () => {
    const r = await call("POST", "/api/shifts/shift-2/cancel", { who: "agency-a", body: { reason: "no-show" } });
    expect(r.status).toBe(200);
    expect(CancelShiftResponse.parse(r.body)).toEqual({
      ...SEED_SHIFTS[1],
      status: "open",
      claimedBy: null,
      cancellation: { reason: "no-show", previousNurseId: "nurse-1" },
    });
  });

  it("409 when cancelling an open shift, 401 without a token", async () => {
    expectError(await call("POST", "/api/shifts/shift-2/cancel", { who: "agency-a", body: { reason: "advance" } }), 409);
    expectError(await call("POST", "/api/shifts/shift-2/cancel", { body: { reason: "advance" } }), 401, ErrorMessage.unauthorized);
  });
});
