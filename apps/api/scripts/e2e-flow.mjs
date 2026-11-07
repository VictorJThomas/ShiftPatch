// API-level end-to-end business flow against a RUNNING built API over real HTTP (no inject, no mocks).
// Stands in for the UI E2E until the Stage 6b screens exist. Needs a freshly seeded database (exact spec seed).
//
//   API_URL=http://localhost:3001 APP_ORIGIN=http://localhost:3000 node apps/api/scripts/e2e-flow.mjs
//
// Exit code 0 = every step matched; 1 = at least one mismatch (all steps still run and are printed).
/* global process, fetch, console, Buffer */
const API = process.env.API_URL ?? "http://localhost:3001";
const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3000";
const PASSWORD = "Trial2026!";
const EMAIL = {
  "agency-a": "admin@sunrisehealth.example",
  "agency-b": "admin@metrocare.example",
  "nurse-1": "maria.lopez@example.com",
  "nurse-2": "james.cook@example.com",
  "admin-1": "alex.kim@example.com",
};

// A date a few days out, kept before nurse-1's seeded license expiry (2027-01-01) so the claim stays eligible.
const SHIFT_DATE = (() => {
  const d = new Date(Math.min(Date.now() + 7 * 86_400_000, Date.parse("2026-12-30T00:00:00Z")));
  return d.toISOString().slice(0, 10);
})();
const has = (r, pred) => Array.isArray(r.body?.shifts) && r.body.shifts.some(pred);

const results = [];
const check = (step, ok, detail = "") => {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? `  (${detail})` : ""}`);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function http(method, path, { token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (body !== undefined) h["content-type"] = "application/json";
  const res = await fetch(`${API}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

const session = {};
for (const who of Object.keys(EMAIL)) {
  const r = await http("POST", "/api/auth/login", { body: { email: EMAIL[who], password: PASSWORD } });
  check(`login ${who} -> 200 { token, user }`, r.status === 200 && Object.keys(r.body).sort().join() === "token,user" && r.body.user.id === who, `status ${r.status}`);
  session[who] = { token: r.body?.token, cookie: r.headers.get("set-cookie") ?? "" };
}
const c = session["nurse-1"].cookie;
check("refresh cookie attributes: HttpOnly, SameSite=Strict, Path=/api/auth, Max-Age 7d",
  /HttpOnly/i.test(c) && /SameSite=Strict/i.test(c) && /Path=\/api\/auth/i.test(c) && /Max-Age=604800/i.test(c), c.replace(/=[^;]+;/, "=<redacted>;"));

// Agency publishes a shift.
const post = await http("POST", "/api/shifts", { token: session["agency-a"].token, body: { role: "RN", date: SHIFT_DATE, startTime: "07:00", endTime: "19:00" } });
const id = post.body?.id;
check("agency-a POST /api/shifts -> 201 open, own agency", post.status === 201 && post.body.agencyId === "agency-a" && post.body.status === "open" && post.body.claimedBy === null, `${post.status} ${id}`);

// Nurse discovers it.
const market = await http("GET", "/api/shifts", { token: session["nurse-1"].token });
check("nurse-1 GET /api/shifts sees the new open shift", market.status === 200 && has(market, (s) => s.id === id && s.status === "open"));
const match1 = await http("GET", "/api/shifts?matchable=true", { token: session["nurse-1"].token });
check("nurse-1 matchable view includes it", match1.status === 200 && has(match1, (s) => s.id === id));

// Lapsed-credential nurse: fallback (nothing matchable) and the exact claim error.
const match2 = await http("GET", "/api/shifts?matchable=true", { token: session["nurse-2"].token });
check("nurse-2 (expired license) matchable view is empty (UI fallback data)", match2.status === 200 && match2.body?.shifts?.length === 0, `${match2.body?.shifts?.length} shifts`);
const claim2 = await http("POST", `/api/shifts/${id}/claim`, { token: session["nurse-2"].token });
check("nurse-2 claim -> 403 exact credential error", claim2.status === 403 && eq(claim2.body, { error: "Credential expired, cannot claim shift" }), JSON.stringify(claim2.body));

// Nurse claims.
const claim1 = await http("POST", `/api/shifts/${id}/claim`, { token: session["nurse-1"].token });
check("nurse-1 claim -> 200 filled by nurse-1", claim1.status === 200 && claim1.body?.status === "filled" && claim1.body?.claimedBy === "nurse-1");
const again = await http("POST", `/api/shifts/${id}/claim`, { token: session["nurse-1"].token });
check("second claim -> 409 Shift is no longer open", again.status === 409 && eq(again.body, { error: "Shift is no longer open" }));

// Admin observes the updated coverage.
const adminView = await http("GET", "/api/agencies/agency-a/shifts", { token: session["admin-1"].token });
check("admin-1 sees the shift filled by nurse-1", adminView.status === 200 && has(adminView, (s) => s.id === id && s.status === "filled" && s.claimedBy === "nurse-1"));
const adminMarket = await http("GET", "/api/shifts", { token: session["admin-1"].token });
check("admin-1 marketplace shows filled too", has(adminMarket, (s) => s.id === id && s.status === "filled"));

// Tenant isolation.
const cross = await http("GET", "/api/agencies/agency-a/shifts", { token: session["agency-b"].token });
check("agency-b GET agency-a shifts -> 403 Forbidden", cross.status === 403 && eq(cross.body, { error: "Forbidden" }));
const hdr = await http("GET", "/api/agencies/agency-a/shifts", { token: session["agency-b"].token, headers: { "x-agency-id": "agency-a" } });
check("agency-b with X-Agency-Id=agency-a -> 403 Agency not available", hdr.status === 403 && eq(hdr.body, { error: "Agency not available" }));
const crossCancel = await http("POST", `/api/shifts/${id}/cancel`, { token: session["agency-b"].token, body: { reason: "no-show" } });
check("agency-b cancel agency-a shift -> 403", crossCancel.status === 403);

// Audit visibility.
const auditAdmin = await http("GET", "/api/audit-logs?limit=100", { token: session["admin-1"].token });
const actions = (auditAdmin.body?.items ?? []).filter((e) => e.entityId === id).map((e) => e.action).sort();
check("admin-1 audit log has shift.created + shift.claimed for it", auditAdmin.status === 200 && actions.includes("shift.created") && actions.includes("shift.claimed"), actions.join(","));
const auditB = await http("GET", "/api/audit-logs?limit=100&agencyId=agency-a", { token: session["agency-b"].token });
check("agency-b audit log never shows agency-a rows (even with agencyId=agency-a)", auditB.status === 200 && (auditB.body?.items ?? []).every((e) => e.agencyId === "agency-b"));
const auditN = await http("GET", "/api/audit-logs", { token: session["nurse-1"].token });
check("nurse audit log -> 403", auditN.status === 403);

// Cancellation reopens the shift.
const cancel = await http("POST", `/api/shifts/${id}/cancel`, { token: session["agency-a"].token, body: { reason: "no-show" } });
check("agency-a cancel no-show -> 200 open + cancellation", cancel.status === 200 && cancel.body?.status === "open" && cancel.body?.claimedBy === null && eq(cancel.body.cancellation, { reason: "no-show", previousNurseId: "nurse-1" }));
const reopened = await http("GET", "/api/shifts?matchable=true", { token: session["nurse-1"].token });
check("nurse-1 sees it open again", has(reopened, (s) => s.id === id && s.status === "open"));

// Auth edges over real HTTP.
const [h, p, s] = (session["nurse-1"].token ?? "x.e30.x").split("."); // e30 = "{}": still runs (and FAILs) without a login
const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url")), role: "admin" })).toString("base64url");
const tampered = await http("GET", "/api/shifts", { token: `${h}.${forged}.${s}` });
check("tampered JWT payload -> 401 Unauthorized", tampered.status === 401 && eq(tampered.body, { error: "Unauthorized" }));
const none = await http("GET", "/api/shifts", { token: `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${p}.` });
check("alg=none JWT -> 401", none.status === 401);
const noBearer = await http("GET", "/api/shifts", { headers: { authorization: session["nurse-1"].token } });
check("token without Bearer scheme -> 401", noBearer.status === 401);
const rawCookie = (session["nurse-1"].cookie ?? "").split(";")[0];
const foreign = await fetch(`${API}/api/auth/refresh`, { method: "POST", headers: { cookie: rawCookie, origin: "https://evil.example" } });
check("refresh with foreign Origin -> 403", foreign.status === 403);
const good = await fetch(`${API}/api/auth/refresh`, { method: "POST", headers: { cookie: rawCookie, origin: ORIGIN } });
check("refresh with app Origin -> 200 + rotated cookie", good.status === 200 && (good.headers.get("set-cookie") ?? "").split(";")[0] !== rawCookie);

// Security headers on a real response.
const health = await fetch(`${API}/api/health`);
check("helmet headers present (CSP none, HSTS, XFO DENY, no-referrer)",
  health.headers.get("content-security-policy")?.startsWith("default-src 'none'") && !!health.headers.get("strict-transport-security") &&
  health.headers.get("x-frame-options") === "DENY" && health.headers.get("referrer-policy") === "no-referrer");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
// Optional: write the JWT signatures + refresh cookie values to a scratch file so the server log can be grepped for leaks.
if (process.env.SECRETS_FILE) {
  const { writeFileSync } = await import("node:fs");
  const secrets = [PASSWORD, ...Object.values(session).flatMap((x) => [x.token?.split(".")[2], x.cookie.split(";")[0].split("=")[1]])].filter(Boolean);
  writeFileSync(process.env.SECRETS_FILE, secrets.join("\n"));
}
process.exit(failed.length ? 1 : 0);
