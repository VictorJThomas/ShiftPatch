# Status (overwrite each session — current truth only)

**Last updated:** 2026-11-07

## Where we are
- Branch `qa/10-full-audit` (cut from `chore/9-prod-db-setup`, 3 commits, not pushed): full QA of the local app for all 5 seeded users in Chrome + audits. Deliverables in `docs/qa/` (WORKFLOW_TEST_RESULTS, DEFECT_LOG, FEATURE_COMPLETENESS, API_ENDPOINT_AUDIT, UI_UX_AUDIT, REMEDIATION_ROADMAP, screenshots) + build plan `docs/stage-6b-feature-ui-plan.md`.
- **Backend verdict:** all 6 spec routes exact, tenant isolation held in every probe, nurse-2 gets 403 `Credential expired, cannot claim shift` exactly and shift stays open, cancel emails reach Mailpit, audit trail + cursor paging correct.
- **UI verdict:** Stage 6b not built. 4 of 15 test IDs exist; every workflow after login is MISSING in the UI. No credential/timesheet routes.
- Fixed this session: QA-002 toast timer restart (`NotificationBanner.tsx`, regression test `Toaster.test.tsx`). Added a local-only `db:reset`. **Escalated QA-006**: refresh limiter 30/IP/min + client treats a 429 as logged out → grader click-through / NAT can be bounced to /login.
- `/verify` GREEN 4/4 (api 429, contract 18, contracts 93, web 36). Web build ✓, Playwright 34/34, `pnpm audit` clean. Local DB restored to the exact seed. Prod untouched (still live + seeded as of 2026-11-07).

## Next step
1. Victor: decide QA-006 (`docs/qa/DEFECT_LOG.md`; options in `docs/stage-6b-feature-ui-plan.md` step 0). Board task "Decide QA-006…".
2. Victor: review/push `qa/10-full-audit` (and the earlier `chore/9-prod-db-setup`), open a PR to `master`.
3. Build Stage 6b per `docs/stage-6b-feature-ui-plan.md` (shell fixes first, then nurse → agency → admin → audit/timesheets), then Stage 7 credentials (upload route + `GET /api/nurses/me/credentials`).
4. Then Playwright E2E against the real API, and re-run the QA matrix in `docs/qa/WORKFLOW_TEST_RESULTS.md`.
5. Prod ops unchanged: see Environment gotchas; before submission check prod still holds the exact seed (shift-1 open). Still open: orphan volume `postgres-volume-mBHD`, secret header on the Vercel rewrite, argon2 cap, Resend.

## Blockers / waiting
- Victor: QA-006 decision; past-date product rule; visual QA of the design canvas.
- Founder decision on export (Option C vs D), see [[ESCALATION]]. Doesn't block the core build.
- Optional: `CONSTRAINTS.md` via `/constraints` (needs a 4-question interview with Victor).

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
- **Postman export:** run `pnpm --filter api exec tsx ../../.claude/skills/postman-export/scripts/export.mjs [--check]`. Plain `node` cannot import the TS app, skips route discovery with a WARN and writes a collection missing the 7 extra routes.
- **Agent worktrees** (`.claude/worktrees/*`, branches `worktree-agent-*`) are created from `master`, not the current branch: tell agents to `git merge --ff-only <branch>` first. They need their own `pnpm install`.
- **Web:** `pnpm --filter web test` (Vitest), `pnpm --filter web test:e2e` (Playwright, Chromium, own `next build && next start -p 3100`, API mocked with `page.route`). `next/font/google` needs network at build. `eslint-config-next` has peer conflicts with eslint 10 (not used).
- **Outbox locally:** `docker compose up -d mailpit` + `MAIL_TRANSPORT=smtp` (UI http://localhost:8025). Default transport `log` prints recipient + subject only.
- **Clock race in tests:** timestamp columns default to Postgres `now()` (microseconds) while app code compares with JS `new Date()` (milliseconds, truncated): a row inserted in the same ms looks up to ~1 ms in the future (measured 54/300). Tests that mean "due now" must set the timestamp explicitly in the past (`notifications.test.ts` `enqueue`). Caused the 2026-11-07 CI failure; prod impact = at most one dispatcher tick of delay.
- **zod + CSP:** the prod CSP has no `unsafe-eval`. zod reads `jitless` when a schema is CONSTRUCTED, so `import "@/lib/zod-csp"` must come first in any web module that imports `@shiftpatch/contracts`/zod. `e2e/security.spec.ts` fails if not.
- **Local least-privilege DB:** the database `shiftpatch_e2e` + role `shiftpatch_app` (password `app-local-only`, local only) exist in the Docker Postgres for the HTTP flow. Recipe: recreate the DB, migrate + seed as `shiftpatch`, `docker cp` the SQL file in and run `psql -v app_password=... -f`, then start the built API with `DATABASE_URL=postgres://shiftpatch_app:...@localhost:5432/shiftpatch_e2e PORT=3002 node --env-file=../../.env dist/server.js` (background), then `API_URL=http://localhost:3002 node apps/api/scripts/e2e-flow.mjs`. In Git Bash use `MSYS_NO_PATHCONV=1` for `docker exec ... /tmp/...` paths.
- Don't hand-edit dependency versions in package.json: it desyncs `pnpm-lock.yaml` and CI's `--frozen-lockfile` fails. Use `pnpm add pkg@x.y.z`, and check with `pnpm install --frozen-lockfile --offline`.
- **Railway SSH:** key `~/.ssh/id_ed25519` is registered with Railway as `shiftpatch-claude` (remove: `npx @railway/cli ssh keys remove`), and the ssh.railway.com host key is in known_hosts. `railway ssh -s <service> -- sh -c '...'` runs commands in the containers: the api container has pnpm + tsx + sources at /app, the Postgres container has psql + `$DATABASE_URL`.
- The auto-mode classifier blocks some Railway/Vercel prod actions (`railway add`, volume delete): Victor runs those, or adds an allow rule.
- **Local reset:** `pnpm --filter api db:reset` drops + recreates + migrates + seeds the local DB (exact spec seed). Guarded: localhost only, DB name `shiftpatch[_x]`, no `?`/`#`, driver-parsed host must match, refuses Railway/Vercel/production env. It drops connections of a running API (pool reconnects). Never use it for prod.
- **QA in Chrome (claude-in-chrome):** the extension's network monitor shows bodiless 204s (logout) as **503**; trust `performance.getEntriesByType('resource')[].responseStatus`. `resize_window` doesn't work on Victor's window (second monitor, `screenX -1709`); for viewports use `apps/web/scripts/qa-responsive.mjs` (Playwright, real app, one login per role). The Grammarly extension causes a dev hydration warning.
- **Refresh limiter bites QA:** more than 30 full page loads/min from one IP → refresh 429 → app shows `/login` (QA-006). Space out reloads in scripted runs.

