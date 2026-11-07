# Status (overwrite each session — current truth only)

**Last updated:** 2026-11-07

## Where we are
- Branch `feature/7-integration-testing-&-security-hardening` (from master `6936861`, which has PR #7 web auth merged). Security pass committed in `e61e62c`; brain wrap is a separate commit. Nothing pushed this session.
- Security pass done and verified ([[Decisions]] → Security pass, [[Session-Log]] 2026-11-07 Stage 8): helmet + pino redaction (API), CSP/HSTS/XFO (web), zod jitless, a 95-cell authz matrix, log-leak tests, the HTTP business flow `apps/api/scripts/e2e-flow.mjs` (29/29 against the built API running as the least-privilege role), `docs/security/db-least-privilege.sql`.
- Last checks: `/verify` **GREEN 4/4** (api 421, contract 18, contracts 93, web unit 34). Playwright 34/34. `pnpm audit` 0 high. gitleaks 0. Frozen install OK. Postman `--check` OK. A fresh-context reviewer found 1 Critical and 1 Medium; both are fixed and re-verified.
- **Not verified yet (no surface):** credential upload abuse (no upload route, Stage 7) and the UI E2E flow (Stage 6b screens missing; 11 of 15 test IDs absent). The API-level flow covers the business path.
- Deploy: web on Vercel and API on Railway are live with health only. No production DB yet.

## Next step
1. Victor: review and push `feature/7-…`, open a PR to `master`. CI should pass (frozen lockfile verified locally).
2. Stage 6b feature UIs (design in `docs/design/screens/`): Nurse (`shift-list-item`, `shift-claim-button`, my shifts `shift-cancel-button`, lapsed-license fallback when `?matchable=true` is empty for an expired license, see §12.4), Agency (`agency-post-shift-button`/`-submit-button`, cancel, withdraw), Admin (`admin-dashboard-shift-table`, `admin-shift-status-badge`, 15 s refetch; `audit-log-table` via `GET /api/audit-logs` + `nextCursor`; `timesheet-table`). **Every new module that builds zod schemas must `import "@/lib/zod-csp"` first.** Then convert `e2e-flow.mjs` into Playwright against the real API.
3. Stage 7 credentials: upload route (10 MB → 413, sniffed type → 415, nurse-only, PII-free keys, private bucket, signed 5-min links), then the board task "Upload abuse tests".
4. Decide: reject past-dated shifts on create/claim/matchable? (board task). If yes, move the fixture dates in `matrix.test.ts` forward (they must stay before nurse-1's license expiry, 2027-01-01).
5. Before the real deploy (Stage 8): Railway env `JWT_SECRET` (>= 32 B), `APP_ORIGIN=https://shiftpatch-web-orcin.vercel.app`, `TRUST_PROXY=2`, `NODE_ENV=production`, mail vars. Migrate + seed with the **owner** URL, run `db-least-privilege.sql`, point the runtime `DATABASE_URL` at `shiftpatch_app` (ARCHITECTURE §15 step 5). Add a secret header from the Vercel rewrite; cap argon2.
6. Mailpit smoke; ARCHITECTURE §8.4/§12 "As built" update from [[Decisions]].

## Blockers / waiting
- Founder decision on export (Option C vs D), see [[ESCALATION]]. Doesn't block the core build.
- Victor: past-date product rule; visual QA of the design canvas.
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
- **Postman export:** run `pnpm --filter api exec tsx ../../.claude/skills/postman-export/scripts/export.mjs [--check]`. Plain `node` cannot import the TS app, skips route discovery with a WARN and writes a collection missing the 7 extra routes.
- **Agent worktrees** (`.claude/worktrees/*`, branches `worktree-agent-*`) are created from `master`, not the current branch: tell agents to `git merge --ff-only <branch>` first. They need their own `pnpm install`.
- **Web:** `pnpm --filter web test` (Vitest), `pnpm --filter web test:e2e` (Playwright, Chromium, own `next build && next start -p 3100`, API mocked with `page.route`). `next/font/google` needs network at build. `eslint-config-next` has peer conflicts with eslint 10 (not used).
- **Outbox locally:** `docker compose up -d mailpit` + `MAIL_TRANSPORT=smtp` (UI http://localhost:8025). Default transport `log` prints recipient + subject only.
- **Clock race in tests:** timestamp columns default to Postgres `now()` (microseconds) while app code compares with JS `new Date()` (milliseconds, truncated): a row inserted in the same ms looks up to ~1 ms in the future (measured 54/300). Tests that mean "due now" must set the timestamp explicitly in the past (`notifications.test.ts` `enqueue`). Caused the 2026-11-07 CI failure; prod impact = at most one dispatcher tick of delay.
- **zod + CSP:** the prod CSP has no `unsafe-eval`. zod reads `jitless` when a schema is CONSTRUCTED, so `import "@/lib/zod-csp"` must come first in any web module that imports `@shiftpatch/contracts`/zod. `e2e/security.spec.ts` fails if not.
- **Local least-privilege DB:** the database `shiftpatch_e2e` + role `shiftpatch_app` (password `app-local-only`, local only) exist in the Docker Postgres for the HTTP flow. Recipe: recreate the DB, migrate + seed as `shiftpatch`, `docker cp` the SQL file in and run `psql -v app_password=... -f`, then start the built API with `DATABASE_URL=postgres://shiftpatch_app:...@localhost:5432/shiftpatch_e2e PORT=3002 node --env-file=../../.env dist/server.js` (background), then `API_URL=http://localhost:3002 node apps/api/scripts/e2e-flow.mjs`. In Git Bash use `MSYS_NO_PATHCONV=1` for `docker exec ... /tmp/...` paths.
- Don't hand-edit dependency versions in package.json: it desyncs `pnpm-lock.yaml` and CI's `--frozen-lockfile` fails. Use `pnpm add pkg@x.y.z`, and check with `pnpm install --frozen-lockfile --offline`.
