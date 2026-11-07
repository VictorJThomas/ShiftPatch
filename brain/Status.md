# Status (overwrite each session — current truth only)

**Last updated:** 2026-11-07

## Where we are
- Branch `feature/6-web-auth` (HEAD `56e3a2a` + brain wrap commit), based on `feature/5-shift-claiming` (`355363f` Stage 5a + Victor's `5cfd698`). Nothing pushed. Stage 5a is committed now.
- Built this session (3 parallel worktree agents, merged): API `GET /api/me`, `POST /api/shifts/:id/withdraw`, `GET /api/nurses/me/shifts`, tolerant empty JSON body, new 403 text `Agency not available` for stale `X-Agency-Id`; outbox dispatcher (lease-based) + mail transports + `shift.cancelled` email; audit scoping for logout/reuse + keyset indexes (migrations 0003, 0004); **web auth experience**: tokens + Schibsted Grotesk, route groups `(auth)/(nurse)/(agency)/(admin)` with shells per design, login (test IDs `login-email-input`, `login-password-input`, `login-submit-button`, `notification-banner`), Zustand session (token in memory), restore via refresh, `lib/api-client.ts` (single-flight refresh, retry once, 409 x3), `proxy.ts` role-cookie redirects (UX only), agency switcher, logout + cross-tab. Details: [[Decisions]] -> Web auth + new routes + outbox.
- Verified on merged branch: `/verify` **GREEN 4/4** (api 319, contracts 93, web unit 34), web build OK, Playwright 32/32, postman `--check` OK (17 requests), drizzle-kit check OK. Fresh-context review: 0 Critical, 4 Important — all fixed and re-verified.
- Shell pages other than login are placeholders (empty states). Only data call in the shells: agency shifts count (`GET /api/agencies/:id/shifts`).
- Design deviations (accepted): login error is the shared toast not an inline alert; nurse shell is a 480 px column not a fixed phone frame; agency band color by membership index; admin nav lacks Credentials; no dark-mode toggle; no "Forgot password?" link.

## Next step
1. Victor: review + push `feature/5-shift-claiming` (PR to `master`), then `feature/6-web-auth` (PR after #5 merges). CI must be green (CI does not run Playwright yet).
2. Stage 6b feature UIs (design screens in `docs/design/screens/`): Nurse (shifts list `shift-list-item`/`shift-claim-button`, my shifts `shift-cancel-button`, lapsed-license fallback per ARCHITECTURE §12.4), Agency (shifts table, post form `agency-post-shift-button`/`-submit-button`, cancel, withdraw), Admin (dashboard table `admin-dashboard-shift-table`/`admin-shift-status-badge`, 15 s refetch; audit `audit-log-table` via `GET /api/audit-logs` + `nextCursor`; timesheets `timesheet-table`). Use api-client + query keys `["agency", id, ...]`.
3. Mailpit smoke: `docker compose up -d mailpit`, API with `MAIL_TRANSPORT=smtp`, cancel a filled shift, see the mail at :8025.
4. Update ARCHITECTURE §8.4 (me, withdraw, nurse shifts shapes) + §12 "As built" from [[Decisions]].
5. Open decisions: claim also requires `roleMatchesLicense`? Before real deploy (Stage 8): Railway env `JWT_SECRET` (>=32 B), `APP_ORIGIN=https://shiftpatch-web-orcin.vercel.app`, `TRUST_PROXY=2`, `NODE_ENV=production`, `MAIL_TRANSPORT=resend` + `RESEND_API_KEY` + `MAIL_FROM` + `EMAIL_REDIRECT_TO`; secret header from the Vercel rewrite; argon2 cap; non-owner `app` DB role (INSERT/SELECT only on `audit_log`); `db:migrate` + `db:seed`.
6. Playwright in CI (board: Stage 8) — web e2e already runs headless with mocked API.

## Blockers / waiting
- Founder decision on export (Option C vs D) — see [[ESCALATION]]. Doesn't block core build.
- Victor: visual QA of design canvas; review of this session's merged branch.
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
