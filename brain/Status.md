# Status (overwrite each session — current truth only)

**Last updated:** 2026-11-07

## Where we are
- Branch `feature/5-shift-claiming`. **UNCOMMITTED:** Stage 4b (claim + cancel, see [[Decisions]] -> Shift claim + cancel) **and Stage 5a: `GET /api/audit-logs`** (`modules/audit/{routes,service,repository,redact,audit}.ts`, contracts `AuditLogQuery/Entry/Response`, `audit-logs.test.ts`). Behaviour + scope: [[Decisions]] -> Audit read API; flow: ARCHITECTURE §11 "As built".
- Audit read: admin = every network they actively administer (needs active network membership), agency = only rows with the validated active `agency_id` (owner/manager; viewer 403; several memberships + no `X-Agency-Id` = 400 `Select an agency`), nurse 403. Authorization runs BEFORE query validation. Filters `entityType/entityId/action/from/to/cursor` (+ additive `limit`, default 50, max 100); `{ items, nextCursor }`, keyset on `id desc`. `changes` redacted on write AND read; `ip`/`userAgent` never returned. No write route exists; DB trigger blocks UPDATE/DELETE/TRUNCATE.
- Writers now share one model (`network_id` + `agency_id` set): `auth.login` (via `auditScopeOf`), `shift.created` (new, same tx as the insert), `shift.claimed`, `shift.cancelled`. Not scoped yet: `auth.logout`, `auth.refresh_reuse_detected`, `auth.login_failed` (unscoped = visible to nobody).
- `/verify` **GREEN 4/4** after the review fixes: 281 unit/integration tests (33 new in `audit-logs.test.ts`, real Postgres), contract suite green. Independent review (`agent-skills:code-reviewer`): no Critical; fixed authz-before-validation (+ removed a probe query), word-based redaction + `__proto__`, `auditScopeOf` filters. Postman regenerated (14 requests, `--check` OK).
- Board: GET /api/audit-logs Done; "Audit module wired into every write" Active (withdraw, credentials, logout scoping still open); 2 new Later tasks. Not built: withdraw, outbox dispatcher/emails, `GET /api/shifts/:id/details`, audit UI.

## Next step
1. Victor: review + commit `feature/5-shift-claiming` (code + `docs/postman/` + brain), push, PR to `master`, CI green.
2. Stage 4c: `POST /api/shifts/:id/withdraw` (`open -> cancelled`, `shift:manage`, audit `shift.withdrawn` with network/agency), then outbox dispatcher + Resend/Mailpit emails for the `shift.cancelled` rows already written.
3. Audit follow-ups (board, Later): indexes `(network_id, id desc)` / `(agency_id, id desc)` (queries sort by `id`, indexes lead with `occurred_at`); scope logout / refresh-reuse rows like login.
4. Decide: claim also requires `roleMatchesLicense`? tolerant empty-JSON-body parser for claim? (see board.)
5. Before real deploy (Stage 8): Railway env `JWT_SECRET` (>=32 B), `APP_ORIGIN=https://shiftpatch-web-orcin.vercel.app`, `TRUST_PROXY=2`, `NODE_ENV=production`; secret header from the Vercel rewrite; argon2 cap; non-owner `app` DB role with INSERT/SELECT only on `audit_log`; `db:migrate` + `db:seed`.
6. Frontend: never send `X-Agency-Id` for nurse/admin; drop a stored one when the membership is revoked (403 on every route). Audit page: `audit-log-table`, call `GET /api/audit-logs`, follow `nextCursor`.

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
- Docker Desktop may be stopped at session start: start it, then `docker compose up -d postgres` before `/verify`.
