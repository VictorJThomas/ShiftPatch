// authenticate + loadActor + X-Agency-Id against a real throwaway Postgres.
import { ErrorMessage } from "@shiftpatch/contracts";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { agencies, agencyMemberships, hospitalNetworks, networkMemberships, nurseProfiles, userProfiles, users } from "../../db/schema/index.js";
import { seed } from "../../db/seed.js";
import { createTestDb } from "../../db/test-db.js";
import type { Actor } from "./actor.js";
import { signAccessToken } from "../auth/tokens.js";

const routes: Array<{ url: string; onRequest: unknown }> = [];
let t: Awaited<ReturnType<typeof createTestDb>>;
let app: FastifyInstance;

beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db);
  await t.db.insert(hospitalNetworks).values({ id: "network-2", name: "Second Network" });
  process.env.DATABASE_URL = t.url;
  app = buildApp();
  app.addHook("onRoute", (r) => void routes.push({ url: r.url, onRequest: r.onRequest })); // sees every route registered after this
  // Probe routes stand in for the Stage 4 handlers: protected exactly the way real routes will be.
  app.register(async (s) => {
    const pre = { onRequest: [s.authenticate, s.loadActor] };
    s.get("/probe", pre, async (req) => ({ actor: req.actor, auth: req.auth }));
    s.post("/probe-body", { ...pre, schema: { body: { type: "object", required: ["x"], properties: { x: { type: "string" } } } } }, async () => ({ ok: true }));
  });
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await t?.drop();
});

let seq = 0;
async function makeUser(opts: { role?: "agency" | "nurse" | "admin"; status?: "active" | "suspended"; deleted?: boolean } = {}) {
  const id = `usr_authz_${++seq}`;
  const role = opts.role ?? "agency";
  await t.db.insert(users).values({
    id, email: `${id}@example.com`, role, passwordHash: "x", status: opts.status ?? "active", deletedAt: opts.deleted ? new Date() : null,
  });
  await t.db.insert(userProfiles).values({ userId: id, fullName: `User ${seq}` });
  return id;
}
const member = (userId: string, agencyId: string, role: "owner" | "manager" | "viewer") =>
  t.db.insert(agencyMemberships).values({ id: `agm_${userId}_${agencyId}`, userId, agencyId, role });
const revokeMember = (userId: string, agencyId: string) =>
  t.db.update(agencyMemberships).set({ revokedAt: new Date(), revokedBy: "admin-1" }).where(eq(agencyMemberships.id, `agm_${userId}_${agencyId}`));
const adminOf = (userId: string, networkId: string) => t.db.insert(networkMemberships).values({ id: `nwm_${userId}_${networkId}`, userId, networkId });

const bearer = async (id: string, role: "agency" | "nurse" | "admin") => ({ authorization: `Bearer ${await signAccessToken({ id, role })}` });
const get = (headers: Record<string, string>) => app.inject({ method: "GET", url: "/probe", headers });
const actorOf = (res: { json: () => unknown }) => (res.json() as { actor: Actor }).actor;
const expect401 = (res: { statusCode: number; json: () => unknown }) => {
  expect(res.statusCode).toBe(401);
  expect(res.json()).toEqual({ error: ErrorMessage.unauthorized }); // exact structure
};
const expect403 = (res: { statusCode: number; json: () => unknown }) => {
  expect(res.statusCode).toBe(403);
  expect(res.json()).toEqual({ error: ErrorMessage.forbidden });
};

describe("deny by default", () => {
  it("every /api route except health and the auth endpoints is wired with authenticate + loadActor", () => {
    const api = routes.filter((r) => r.url.startsWith("/api/") && r.url !== "/api/health" && !r.url.startsWith("/api/auth/"));
    for (const r of api) expect(r.onRequest, r.url).toEqual(expect.arrayContaining([app.authenticate, app.loadActor]));
    expect(routes.some((r) => r.url === "/probe")).toBe(true); // collector is live (Stage 4 routes land under /api/)
  });
});

describe("authenticate", () => {
  it("a missing JWT_SECRET is a 500 with the generic body, never a 401", async () => {
    const headers = await bearer("agency-a", "agency");
    const saved = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      const res = await get(headers);
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Internal server error" });
    } finally {
      process.env.JWT_SECRET = saved;
    }
  });

  it("rejects a missing or malformed Authorization header with the exact 401", async () => {
    for (const authorization of [undefined, "", "Bearer", "Bearer ", "Basic abc", "bearer abc", "Bearer a b", "Token abc"]) {
      expect401(await get(authorization === undefined ? {} : { authorization }));
    }
  });

  it("rejects garbage, wrong-secret, expired, wrong-algorithm and alg=none tokens", async () => {
    const claims = { role: "agency" };
    const sign = (alg: string, secret: string, exp: string | number) =>
      new SignJWT(claims).setProtectedHeader({ alg }).setSubject("agency-a").setJti("j").setIssuedAt().setExpirationTime(exp).sign(new TextEncoder().encode(secret));
    const good = process.env.JWT_SECRET!;
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: "agency-a", role: "agency", jti: "j", exp: 9999999999 })).toString("base64url")}.`;
    for (const token of [
      "garbage",
      await sign("HS256", "x".repeat(40), "15m"),
      await sign("HS256", good, Math.floor(Date.now() / 1000) - 60),
      await sign("HS512", good, "15m"), // same secret, wrong algorithm
      none,
    ]) {
      expect401(await get({ authorization: `Bearer ${token}` }));
    }
  });

  it("rejects a token missing sub/jti or with an unknown role claim", async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const noJti = await new SignJWT({ role: "agency" }).setProtectedHeader({ alg: "HS256" }).setSubject("agency-a").setExpirationTime("15m").sign(secret);
    const badRole = await new SignJWT({ role: "root" }).setProtectedHeader({ alg: "HS256" }).setSubject("agency-a").setJti("j").setExpirationTime("15m").sign(secret);
    expect401(await get({ authorization: `Bearer ${noJti}` }));
    expect401(await get({ authorization: `Bearer ${badRole}` }));
  });

  it("rejects an unknown user, a deleted user and a suspended user (valid signature)", async () => {
    expect401(await get(await bearer("nobody", "agency")));
    expect401(await get(await bearer(await makeUser({ deleted: true }), "agency")));
    expect401(await get(await bearer(await makeUser({ status: "suspended" }), "agency")));
  });

  it("rejects an inactive nurse", async () => {
    const id = await makeUser({ role: "nurse" });
    await t.db.insert(nurseProfiles).values({ userId: id, networkId: "network-default", status: "inactive" });
    expect401(await get(await bearer(id, "nurse")));
  });

  it("rejects a token whose role claim no longer matches the user's role (stale session)", async () => {
    expect401(await get(await bearer("agency-a", "admin")));
    expect401(await get(await bearer("nurse-1", "agency")));
  });

  it("401 beats 400: invalid body without a token never reaches schema validation", async () => {
    const res = await app.inject({ method: "POST", url: "/probe-body", payload: {} });
    expect401(res);
    const authed = await app.inject({ method: "POST", url: "/probe-body", payload: {}, headers: await bearer("agency-a", "agency") });
    expect(authed.statusCode).toBe(400); // with a token, validation runs
  });

  it("sets x-request-id on responses, including 401s", async () => {
    const res = await get({});
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("a suspended user is cut off on the very next request with the same token", async () => {
    const id = await makeUser();
    const headers = await bearer(id, "agency");
    expect((await get(headers)).statusCode).toBe(200);
    await t.db.update(users).set({ status: "suspended" }).where(eq(users.id, id));
    expect401(await get(headers));
  });

  it("a deleted user is cut off on the very next request", async () => {
    const id = await makeUser();
    const headers = await bearer(id, "agency");
    await t.db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));
    expect401(await get(headers));
  });
});

describe("loadActor: roles", () => {
  it("agency (seed): owner of its own agency only, implicit active agency", async () => {
    const a = actorOf(await get(await bearer("agency-a", "agency")));
    expect(a).toEqual({
      userId: "agency-a", role: "agency", status: "active", agencies: [{ agencyId: "agency-a", role: "owner" }],
      networkIds: [], nurseNetworkId: null, activeAgencyId: "agency-a",
    });
  });

  it("agency users are not automatically members of other agencies", async () => {
    const a = actorOf(await get(await bearer("agency-b", "agency")));
    expect(a.agencies.map((m) => m.agencyId)).toEqual(["agency-b"]);
  });

  it("nurse (seed): no agency memberships, roster network set, no active agency", async () => {
    const a = actorOf(await get(await bearer("nurse-1", "nurse")));
    expect(a).toMatchObject({ role: "nurse", agencies: [], networkIds: [], nurseNetworkId: "network-default", activeAgencyId: null });
  });

  it("admin (seed): scoped through network membership", async () => {
    const a = actorOf(await get(await bearer("admin-1", "admin")));
    expect(a).toMatchObject({ role: "admin", agencies: [], networkIds: ["network-default"], activeAgencyId: null });
  });

  it.each(["owner", "manager", "viewer"] as const)("agency %s membership role is loaded", async (role) => {
    const id = await makeUser();
    await member(id, "agency-a", role);
    const a = actorOf(await get(await bearer(id, "agency")));
    expect(a.agencies).toEqual([{ agencyId: "agency-a", role }]);
    expect(a.activeAgencyId).toBe("agency-a");
  });

  it("admin without any network membership gets no networks; a second network is scoped separately", async () => {
    const none = await makeUser({ role: "admin" });
    expect(actorOf(await get(await bearer(none, "admin"))).networkIds).toEqual([]);
    const two = await makeUser({ role: "admin" });
    await adminOf(two, "network-2");
    expect(actorOf(await get(await bearer(two, "admin"))).networkIds).toEqual(["network-2"]);
  });

  it("a revoked network membership takes effect on the next request", async () => {
    const id = await makeUser({ role: "admin" });
    await adminOf(id, "network-default");
    const headers = await bearer(id, "admin");
    expect(actorOf(await get(headers)).networkIds).toEqual(["network-default"]);
    await t.db.update(networkMemberships).set({ revokedAt: new Date() }).where(eq(networkMemberships.id, `nwm_${id}_network-default`));
    expect(actorOf(await get(headers)).networkIds).toEqual([]);
  });

  it("a suspended network stops counting", async () => {
    const id = await makeUser({ role: "admin" });
    await adminOf(id, "network-2");
    await t.db.update(hospitalNetworks).set({ status: "suspended" }).where(eq(hospitalNetworks.id, "network-2"));
    expect(actorOf(await get(await bearer(id, "admin"))).networkIds).toEqual([]);
    await t.db.update(hospitalNetworks).set({ status: "active" }).where(eq(hospitalNetworks.id, "network-2"));
  });

  it("memberships on a nurse or admin account are ignored (one primary global role)", async () => {
    const n = await makeUser({ role: "nurse" });
    await member(n, "agency-a", "owner");
    const a = actorOf(await get(await bearer(n, "nurse")));
    expect(a.agencies).toEqual([]);
    expect(a.activeAgencyId).toBeNull();
  });

  it("a revoked agency membership takes effect on the next request", async () => {
    const id = await makeUser();
    await member(id, "agency-a", "manager");
    const headers = await bearer(id, "agency");
    expect(actorOf(await get(headers)).agencies).toHaveLength(1);
    await revokeMember(id, "agency-a");
    const a = actorOf(await get(headers));
    expect(a.agencies).toEqual([]);
    expect(a.activeAgencyId).toBeNull();
  });

  it("a suspended agency stops counting as a membership", async () => {
    const id = await makeUser();
    await member(id, "agency-b", "owner");
    await t.db.update(agencies).set({ status: "suspended" }).where(eq(agencies.id, "agency-b"));
    const headers = await bearer(id, "agency");
    expect(actorOf(await get(headers)).agencies).toEqual([]);
    expect((await get({ ...headers, "x-agency-id": "agency-b" })).statusCode).toBe(403);
    await t.db.update(agencies).set({ status: "active" }).where(eq(agencies.id, "agency-b"));
  });

  it("does not trust membership data in the JWT: extra claims are ignored", async () => {
    const id = await makeUser();
    const forged = await new SignJWT({ role: "agency", agencies: [{ agencyId: "agency-a", role: "owner" }], activeAgencyId: "agency-a" })
      .setProtectedHeader({ alg: "HS256" }).setSubject(id).setJti("j").setExpirationTime("15m")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    const a = actorOf(await get({ authorization: `Bearer ${forged}` }));
    expect(a.agencies).toEqual([]);
    expect(a.activeAgencyId).toBeNull();
  });
});

describe("X-Agency-Id", () => {
  async function multiUser() {
    const id = await makeUser();
    await member(id, "agency-a", "owner");
    await member(id, "agency-b", "viewer");
    return bearer(id, "agency");
  }

  it("single membership: header omitted -> that agency; header naming it -> same", async () => {
    const headers = await bearer("agency-a", "agency");
    expect(actorOf(await get(headers)).activeAgencyId).toBe("agency-a");
    expect(actorOf(await get({ ...headers, "x-agency-id": "agency-a" })).activeAgencyId).toBe("agency-a");
  });

  it("multiple memberships: header omitted -> activeAgencyId null, both memberships exposed", async () => {
    const a = actorOf(await get(await multiUser()));
    expect(a.activeAgencyId).toBeNull();
    expect(a.agencies.map((m) => m.agencyId).sort()).toEqual(["agency-a", "agency-b"]);
  });

  it("multiple memberships: a valid header selects the agency", async () => {
    const headers = await multiUser();
    expect(actorOf(await get({ ...headers, "x-agency-id": "agency-b" })).activeAgencyId).toBe("agency-b");
  });

  it("an agency the user does not belong to -> 403 Forbidden (single and multi)", async () => {
    expect403(await get({ ...(await bearer("agency-a", "agency")), "x-agency-id": "agency-b" }));
    expect403(await get({ ...(await multiUser()), "x-agency-id": "agency-zzz" }));
  });

  it("empty, junk, injection-looking and duplicated values -> 403", async () => {
    const headers = await multiUser();
    for (const v of ["", " ", "agency-a ", "AGENCY-A", "agency-a, agency-b", "agency-a' OR '1'='1", "%00"]) {
      expect403(await get({ ...headers, "x-agency-id": v }));
    }
  });

  it("nurse and admin sending the header are rejected (they hold no agency memberships)", async () => {
    expect403(await get({ ...(await bearer("nurse-1", "nurse")), "x-agency-id": "agency-a" }));
    expect403(await get({ ...(await bearer("admin-1", "admin")), "x-agency-id": "agency-a" }));
  });

  it("a revoked membership can no longer be selected", async () => {
    const id = await makeUser();
    await member(id, "agency-a", "owner");
    await member(id, "agency-b", "owner");
    const headers = { ...(await bearer(id, "agency")), "x-agency-id": "agency-b" };
    expect(actorOf(await get(headers)).activeAgencyId).toBe("agency-b");
    await revokeMember(id, "agency-b");
    expect403(await get(headers));
  });

  it("the header never grants a role: the loaded role is the membership's", async () => {
    const headers = await multiUser();
    const a = actorOf(await get({ ...headers, "x-agency-id": "agency-b" }));
    expect(a.agencies.find((m) => m.agencyId === a.activeAgencyId)?.role).toBe("viewer");
  });

  it("no context leaks between concurrent requests", async () => {
    const headers = await multiUser();
    const sel = (i: number) => (i % 3 === 0 ? "agency-a" : i % 3 === 1 ? "agency-b" : undefined);
    const results = await Promise.all(
      Array.from({ length: 30 }, async (_, i) => {
        const h = sel(i) ? { ...headers, "x-agency-id": sel(i)! } : headers;
        return { want: sel(i) ?? null, got: actorOf(await get(h)).activeAgencyId };
      }),
    );
    for (const r of results) expect(r.got).toBe(r.want);
    // and a header-less request afterwards on the same app still has no selection
    expect(actorOf(await get(headers)).activeAgencyId).toBeNull();
  });
});
