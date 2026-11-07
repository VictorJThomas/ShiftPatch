# Status (overwrite each session — current truth only)

**Last updated:** 2026-11-06

## Where we are
- Branch `feature/3-auth-backend`. **Auth lifecycle + authorization infra built, all UNCOMMITTED** (last commit e5b7194 = auth routes).
- Authz = `apps/api/src/modules/authz/{actor,plugin,decision,can,scope}.ts` + `policy.ts` in `modules/{shifts,memberships,audit,credentials,admin}` + `modules/{shifts,audit}/repository.ts` (scope-required). `authenticate`/`loadActor` are `onRequest` hooks (`{ onRequest: [app.authenticate, app.loadActor] }`); `req.actor`, `can()`, `sendDenial()`. Actor model, matrix, reason→HTTP map: ARCHITECTURE §7.2 "As built"; choices: [[Decisions]] → Authorization.
- `/verify` **GREEN 4/4** after review fixes; `pnpm build` OK. 87 authz tests (policy matrix, real-Postgres pipeline/actor/X-Agency-Id/revocation, scope forgery); 4 mutation checks turned tests red. Contracts: `ErrorMessage.agencyRequired` ("Select an agency").
- Independent review (`agent-skills:code-reviewer`): no Critical. Fixed: write-check order (403 before 400), credential reads w/o selection, `agencyScopeForAdmin`, `JwtConfigError`, deny-by-default route-collector test. Accepted/documented: scope ≠ `can()`; stray header 403 for nurse/admin; 2-query TOCTOU; viewer excluded from audit/credential reads.
- No real route is protected yet (probe routes in tests). Deployed API/web unchanged (health only).

## Next step
1. Victor: review + commit `feature/3-auth-backend` (auth + authz), push, PR to `master`, CI green. Run `/postman-export --check` after (no route change expected).
2. Stage 4 shifts: every `/api/*` route must carry both hooks (a test enforces it). Handlers: load resource facts (`networkId`, `agencyIdsHoldingNurse`) from the DB, `can()` → `sendDenial()`, then scoped repo (`agencyScope`/`agencyScopeForAdmin`/`networkScope`). Contract blocks auto-activate.
3. Before real deploy (Stage 8): Railway env `JWT_SECRET` (>=32 B), `APP_ORIGIN=https://shiftpatch-web-orcin.vercel.app` (exact, no trailing slash; unset => browser refresh/logout 403), `TRUST_PROXY=2` (verify `req.ip` once), `NODE_ENV=production`. Consider secret header from the Vercel rewrite (review S2). Optional: argon2 concurrency cap (S5).
4. Still open from contracts: Fastify empty JSON body on claim (`FST_ERR_CTP_EMPTY_JSON_BODY`).
5. Before first data deploy: Railway Postgres, migrations, `db:migrate` + `db:seed`, non-owner `app` DB role.
6. Frontend: never send `X-Agency-Id` for nurse/admin (403).

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
- Tests: JWT test secret is set in both vitest configs (`test.env`); auth tests use a unique `remoteAddress` per request so the in-memory limiter only bites in the rate-limit tests.
