# Status (overwrite each session — current truth only)

**Last updated:** 2026-11-06

## Where we are
- Branch `feature/4-shift-listing` (from master after PR #4). **Stage 4a built, UNCOMMITTED:** `GET /api/shifts`, `GET /api/shifts?matchable=true`, `GET /api/agencies/:agencyId/shifts`, `POST /api/shifts` in `apps/api/src/modules/shifts/{routes,service,repository,mappers,eligibility,policy}.ts`; `MarketplaceScope` in `authz/scope.ts`; contracts gained optional `facilityId`, start!=end refine, `ErrorMessage.invalidFacility`, `ListShiftsQuery`. Choices: [[Decisions]] -> Shift listing + creation.
- `/verify` **GREEN 4/4** (re-run after the `start:local`/logging/`dev --env-file` changes). Local run: `pnpm --filter api start:local` or `pnpm --filter api dev`, both load root `.env` and log the port + 5xx causes (Victor confirmed login works). 3 mutation checks (matchable role gate, license-type filter, soft-delete filter) turned tests red. Contract tests: routes 2, 3, 6 live; claim/cancel blocks still skipped. `/postman-export --check` OK (collection regenerated, uncommitted).
- Independent review (`agent-skills:code-reviewer`, `/agent-skills:review` + `/verify`): APPROVE, no Critical. Fixed: safe list ordering, memoised `todayIn`, fixed-clock eligibility service test, stray-header test, order-independent POST tests. Documented: one network per agency assumption, stale `X-Agency-Id` = 403 on every route, past open shifts are matchable.
- Not yet built: claim, cancel, withdraw, audit wiring, `GET /api/shifts/:id/details`. Deployed API/web unchanged (health only).

## Next step
1. Victor: review + commit `feature/4-shift-listing` (code + `docs/postman/` + brain), push, PR to `master`, CI green.
2. Stage 4b: `POST /api/shifts/:id/claim` (reuse `isEligible` from `shifts/eligibility.ts`, atomic `UPDATE ... WHERE status='open'`, exact 403 text, `can("shift:claim")`), then cancel + `shift_cancellations`, withdraw. Every `/api/*` route needs `{ onRequest: [app.authenticate, app.loadActor] }` (a test enforces it). Un-skip the contract blocks automatically.
3. Before real deploy (Stage 8): Railway env `JWT_SECRET` (>=32 B), `APP_ORIGIN=https://shiftpatch-web-orcin.vercel.app`, `TRUST_PROXY=2`, `NODE_ENV=production`; secret header from the Vercel rewrite (review S2); argon2 cap (S5).
4. Still open from contracts: Fastify empty JSON body on claim (`FST_ERR_CTP_EMPTY_JSON_BODY`).
5. Before first data deploy: Railway Postgres, migrations, `db:migrate` + `db:seed`, non-owner `app` DB role.
6. Frontend: never send `X-Agency-Id` for nurse/admin, and drop a stored one when the membership is revoked (403 on every route, incl. `GET /api/shifts`).

## Blockers / waiting
- Founder decision on export (Option C vs D) — see [[ESCALATION]]. Doesn't block core build.
- Victor: visual QA of design canvas.
- Optional: `CONSTRAINTS.md` via `/constraints` (needs a 4-question interview with Victor; not done).

## Environment gotchas
Windows 11, memory-constrained. Never run dev servers in foreground; kill orphan `node` first. Project path is OneDrive-synced: pin Turbopack workspace root in config. See global CLAUDE.md. Python 3.14 + Node 26 + pnpm 10.7 + Docker 29 available. `tasks_md.py` keeps the file's CRLF/LF style.
- GitHub repo renamed to `VictorJThomas/ShiftPatch`; local `origin` still points at old `ShiftPatc` (redirect works; repoint blocked by permission classifier — Victor: `git remote set-url origin https://github.com/VictorJThomas/ShiftPatch.git`).
- Railway CLI logged in as victorjthomas01@gmail.com. Use `npx @railway/cli` / `npx vercel` (no global CLIs, no `gh`). `vercel link` adds `.env*` to `.gitignore` and creates `.env.local` — revert/delete.
- Official MinIO Docker images are gone; use Chainguard (distroless: no shell/curl in container).
- Local Postgres: `docker compose up -d postgres` (container `shiftpatch-postgres-1`). Role `shiftpatch` is a superuser. Heredocs with apostrophes inside Python-in-Bash can break the tool; use the Write tool for big files. drizzle-kit may order generated statements wrongly (UNIQUE after the FK that needs it): read every generated migration.
- Notion query tool needs `"mode": "sql"` inside `data`.
- Contracts: prod (`node dist/server.js`, `next build`) reads `packages/contracts/dist` → stale if `src` changed without rebuild. pnpm doesn't run `pre*` scripts. Fastify parses empty JSON bodies as an error before Zod.
- `next build` rewrites `apps/web/next-env.d.ts` (adds a `root-params` import): revert with `git checkout -- apps/web/next-env.d.ts` before committing.
- `@fastify/rate-limit`: `app.rateLimit()` handlers share a per-request "ran" flag — a 2nd one on the same route silently skips; use `app.createRateLimit()`. Its decorators exist only after the plugin loads → register routes in a nested `app.register`.
- Fastify 5 types reject a numeric `trustProxy` (runtime accepts it) → use the function form `(addr, hop) => hop < n`.
- **Running the built API locally:** `pnpm --filter api start:local` (background): runs `tsc` then `node --env-file=../../.env dist/server.js`, so no stale `dist/` and `.env` is loaded. Rebuild contracts first if `packages/contracts/src` changed. Plain `node dist/server.js` / `pnpm start` loads NO `.env` (login 500 = `JWT_SECRET` missing) and serves whatever `dist/` holds (stale `dist/` symptom: new routes 404, not 401). Or `pnpm --filter api dev` (tsx watch; also passes `--env-file=../../.env`). Postman local env = port 3001.
- **Server logs:** `server.ts` runs Fastify with `logger: true` (pino JSON: listen address, each request, 5xx with stack via the error handler) and prints `ShiftPatch API listening on http://localhost:<PORT>`. Tests build the app with the logger off. A 500 body stays generic; read the terminal for the cause.
- Tests: JWT test secret is set in both vitest configs (`test.env`); auth tests use a unique `remoteAddress` per request so the in-memory limiter only bites in the rate-limit tests.
