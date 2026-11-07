#!/usr/bin/env node
/* global process, console */
// Export ShiftPatch's API as a Postman v2.1 collection + local/prod environments (docs/postman/).
// Schemas come from @shiftpatch/contracts (zod -> JSON Schema), routes from the real Fastify app.
//
// Run from repo root (tsx is needed to import the TS sources):
//   pnpm --filter api exec tsx ../../.claude/skills/postman-export/scripts/export.mjs          # write
//   pnpm --filter api exec tsx ../../.claude/skills/postman-export/scripts/export.mjs --check  # verify, no write
// --check exits 1 if the committed files are stale or a self-test fails.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const OUT = join(ROOT, "docs/postman");
const CHECK = process.argv.includes("--check");
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

const c = await imp("packages/contracts/src/index.ts");
// Same zod instance the contracts use (this script lives outside any package, so a bare "zod" won't resolve).
const zodDir = dirname(createRequire(join(ROOT, "packages/contracts/package.json")).resolve("zod/package.json"));
const { z } = await import(pathToFileURL(join(zodDir, "index.js")).href);

// ---------- Routes registered in the real app ----------
let registered = null; // null = app could not be built (then every route is listed without the check)
try {
  const { buildApp } = await imp("apps/api/src/app.ts");
  const app = buildApp();
  await app.ready();
  // ponytail: parses printRoutes text (Fastify has no route-list API); breaks only if its tree format changes.
  registered = new Set();
  // Nested nodes print relative to their parent (`/api/shifts` > `/:id/claim`), 4 chars of indent per level: rebuild the full path.
  const stack = [];
  for (const m of app.printRoutes({ commonPrefix: false }).matchAll(/^((?:│   |    )*)(?:├── |└── )(\/\S*) \(([A-Z, ]+)\)/gm)) {
    const depth = m[1].length / 4;
    const full = (depth ? stack[depth - 1] : "") + m[2];
    stack[depth] = full;
    for (const method of m[3].split(", ")) registered.add(`${method} ${full}`);
  }
  await app.close();
} catch (err) {
  console.warn(`WARN could not build the Fastify app, route check skipped: ${err.message}`);
}

// ---------- Required routes (spec) -> contract schemas ----------
const PASSWORD = "Trial2026!"; // public spec seed password, not a secret
const USERS = [
  ["nurse-1", "maria.lopez@example.com", "nurse, valid credential"],
  ["nurse-2", "james.cook@example.com", "nurse, EXPIRED credential (claim -> 403)"],
  ["agency-a", "admin@sunrisehealth.example", "agency, Sunrise Health Staffing"],
  ["agency-b", "admin@metrocare.example", "agency, Metro Care Partners"],
  ["admin-1", "alex.kim@example.com", "admin"],
];
const REQUIRED = [
  ...USERS.map(([id, email, who]) => ({
    folder: "1. Auth", name: `Login as ${id}`, method: "POST", path: "/api/auth/login", auth: false,
    body: { email, password: PASSWORD }, req: c.LoginRequest, res: c.LoginResponse, setsToken: true,
    doc: `Logs in as **${who}** and stores \`token\` for every other request.`,
  })),
  { folder: "2. Shifts", name: "List all shifts", method: "GET", path: "/api/shifts", res: c.ListShiftsResponse,
    doc: "Marketplace view: every shift across both agencies. Any logged-in role." },
  { folder: "2. Shifts", name: "Post a shift (agency)", method: "POST", path: "/api/shifts",
    body: { role: "RN", date: "2026-10-05", startTime: "07:00", endTime: "19:00" },
    req: c.CreateShiftRequest, res: c.CreateShiftResponse,
    doc: "Agency token. Scoped to the caller's agency; an `agencyId` in the body is ignored. 201." },
  { folder: "2. Shifts", name: "Claim a shift (nurse)", method: "POST", path: "/api/shifts/:id/claim",
    params: { id: "shift-1" }, req: c.ClaimShiftRequest, res: c.ClaimShiftResponse,
    doc: `Nurse token, empty body. As nurse-2: 403 \`${c.ErrorMessage.credentialExpired}\`.` },
  { folder: "2. Shifts", name: "Cancel a claimed shift", method: "POST", path: "/api/shifts/:id/cancel",
    params: { id: "shift-2" }, body: { reason: "no-show" }, req: c.CancelShiftRequest, res: c.CancelShiftResponse,
    doc: "Reopens a filled shift. `reason`: `no-show` or `advance`. Returns the shift + `cancellation`." },
  { folder: "3. Agencies", name: "Agency's own shifts", method: "GET", path: "/api/agencies/:agencyId/shifts",
    params: { agencyId: "agency-a" }, res: c.AgencyShiftsResponse,
    doc: "Agency member or admin. Another agency's id -> 403 `Forbidden`." },
];

const jsonSchema = (s, io) => z.toJSONSchema(s, { target: "draft-7", io });
const ERROR_SCHEMA = jsonSchema(c.ErrorBody, "output");

function request(r) {
  const implemented = !registered || registered.has(`${r.method} ${r.path}`);
  const segs = r.path.split("/").filter(Boolean);
  const exec = [
    `// Contract check: success body must match the route schema, errors must be exactly { error }.`,
    `const ok = ${JSON.stringify(jsonSchema(r.res, "output"))};`,
    `const err = ${JSON.stringify(ERROR_SCHEMA)};`,
    `pm.test("body matches the contract", () => pm.response.to.have.jsonSchema(pm.response.code < 400 ? ok : err));`,
    ...(r.setsToken
      ? [`if (pm.response.code === 200) (pm.environment.name ? pm.environment : pm.collectionVariables).set("token", pm.response.json().token);`]
      : []),
  ];
  const doc = [
    implemented ? "" : "> **Not implemented yet** (no handler registered in `apps/api`).\n\n",
    r.doc,
    r.req ? `\n\n**Request schema**\n\`\`\`json\n${JSON.stringify(jsonSchema(r.req, "input"), null, 2)}\n\`\`\`` : "",
  ].join("");
  return {
    name: r.name,
    event: [{ listen: "test", script: { type: "text/javascript", exec } }],
    request: {
      method: r.method,
      ...(r.auth === false ? { auth: { type: "noauth" } } : {}),
      header: r.body ? [{ key: "Content-Type", value: "application/json" }] : [],
      ...(r.body ? { body: { mode: "raw", raw: JSON.stringify(r.body, null, 2), options: { raw: { language: "json" } } } } : {}),
      url: {
        raw: `{{baseUrl}}${r.path}`,
        host: ["{{baseUrl}}"],
        path: segs,
        ...(r.params ? { variable: Object.entries(r.params).map(([key, value]) => ({ key, value })) } : {}),
      },
      description: doc,
    },
  };
}

// Extra routes: registered in the app but not part of the spec (e.g. /api/health). No schema, listed as-is.
const requiredKeys = new Set(REQUIRED.map((r) => `${r.method} ${r.path}`));
const extras = [...(registered ?? [])]
  .filter((k) => !requiredKeys.has(k) && !k.startsWith("HEAD ") && !k.startsWith("OPTIONS "))
  .sort()
  .map((k) => {
    const [method, path] = k.split(" ");
    return {
      name: `${method} ${path}`,
      request: { method, header: [], url: { raw: `{{baseUrl}}${path}`, host: ["{{baseUrl}}"], path: path.split("/").filter(Boolean) } },
    };
  });

const folders = [...new Set(REQUIRED.map((r) => r.folder))].map((name) => ({
  name,
  item: REQUIRED.filter((r) => r.folder === name).map(request),
}));
if (extras.length) folders.push({ name: "4. Other routes", item: extras });

const collection = {
  info: {
    name: "ShiftPatch API",
    description:
      "Generated by `.claude/skills/postman-export` from `@shiftpatch/contracts` and the Fastify route table. Do not edit by hand: regenerate.\n\n" +
      "1. Pick the **ShiftPatch local** or **ShiftPatch prod** environment.\n2. Run a request in **1. Auth** (stores `token`).\n3. Call any other route. Each response is checked against its contract schema (Tests tab).",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  auth: { type: "bearer", bearer: [{ key: "token", value: "{{token}}", type: "string" }] },
  variable: [
    { key: "baseUrl", value: "http://localhost:3001" },
    { key: "token", value: "" },
  ],
  item: folders,
};

const env = (name, baseUrl) => ({
  name,
  values: [
    { key: "baseUrl", value: baseUrl, type: "default", enabled: true },
    { key: "token", value: "", type: "secret", enabled: true },
  ],
  _postman_variable_scope: "environment",
});

const files = {
  "ShiftPatch.postman_collection.json": collection,
  "ShiftPatch-local.postman_environment.json": env("ShiftPatch local", "http://localhost:3001"),
  // One public origin: Vercel rewrites /api/* to Railway (Decisions C1).
  "ShiftPatch-prod.postman_environment.json": env("ShiftPatch prod", "https://shiftpatch-web-orcin.vercel.app"),
};
const text = (o) => JSON.stringify(o, null, 2) + "\n";

// ---------- Self-test ----------
const problems = [];
const all = folders.flatMap((f) => f.item);
for (const [m, p] of [["POST", "/api/auth/login"], ["GET", "/api/shifts"], ["POST", "/api/shifts"], ["POST", "/api/shifts/:id/claim"], ["POST", "/api/shifts/:id/cancel"], ["GET", "/api/agencies/:agencyId/shifts"]]) {
  if (!all.some((i) => i.request.method === m && i.request.url.raw === `{{baseUrl}}${p}`)) problems.push(`missing required route ${m} ${p}`);
}
for (const i of all.filter((x) => x.event)) {
  if (!i.event[0].script.exec.some((l) => l.includes("jsonSchema"))) problems.push(`${i.name}: no contract test`);
}
const shift = jsonSchema(c.Shift, "output");
const keys = Object.keys(shift.properties ?? {});
if (keys.join() !== "id,agencyId,agencyName,role,date,startTime,endTime,status,claimedBy" || shift.additionalProperties !== false) {
  problems.push(`Shift schema is not the exact 9-key strict shape: ${keys.join()}`);
}
if (!all.some((i) => i.event?.[0].script.exec.some((l) => l.includes('set("token"')))) problems.push("no request stores the token");

const pending = REQUIRED.filter((r) => registered && !registered.has(`${r.method} ${r.path}`)).map((r) => `${r.method} ${r.path}`);
const uniq = [...new Set(pending)];

if (CHECK) {
  for (const [name, obj] of Object.entries(files)) {
    const p = join(OUT, name);
    if (!existsSync(p)) problems.push(`${name} missing: run without --check`);
    else if (readFileSync(p, "utf8").replace(/\r\n/g, "\n") !== text(obj)) problems.push(`${name} is stale: run without --check`);
  }
} else {
  mkdirSync(OUT, { recursive: true });
  for (const [name, obj] of Object.entries(files)) writeFileSync(join(OUT, name), text(obj));
}

console.log(`${CHECK ? "checked" : "wrote"} ${Object.keys(files).length} files in docs/postman: ${all.length} requests (${extras.length} extra routes)`);
if (uniq.length) console.log(`not implemented yet: ${uniq.join(", ")}`);
if (problems.length) {
  console.error(`FAIL\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("OK");
