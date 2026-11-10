# Status (overwrite each session — current truth only)

**Last updated:** 2026-11-10

## Where we are
- **Final MVP is on master and deployed:** `0291eec` (PR #17), after PR #16 (branded email). The master pipeline (checks, e2e, security, deploy) is green. Prod smoke: `/api/health` ok, `/login` 200, bad login gives the exact 401 text. The logo URL returns 200 image/png. Prod mail transport: `resend` (log line after deploy).
- PR #17 added: claim enforces license type vs shift role (403 "License type does not match shift role"; seed unaffected); `access.denied` audit rows plus a typed `AuditAction` (`docs/qa/AUDIT_COVERAGE.md`); +24 credential security tests; a **Playwright e2e job in CI** (mocked + real API/Postgres) that deploy now needs; the `[to: …]` subject prefix when redirecting.
- Last `/verify` GREEN (typecheck, lint, test 580 api + 201 web, contract). Real-API flows 10/10.
- Design-canvas visual QA done: `docs/qa/CANVAS_QA.md`, 0 P1, no code changes (triage inside).
- Branch `feature/17-final-wrap`: brain + QA docs only (not merged yet).
- Board: every MVP build task is Done. Open: prod reseed, Loom, transcript re-export, plus the decisions below.

## Next step
1. **Victor: prod mail test.** Log in at prod as admin@sunrisehealth.example and post an RN shift (future date). E1 goes to maria.lopez@example.com, redirected to the `EMAIL_REDIRECT_TO` inbox with subject `[to: maria.lopez@example.com] …`. Check the logo, facts card and CTA in Gmail. Record the result in Session-Log.
2. **Victor: prod reseed (destructive gate).** `bash apps/api/scripts/railway-db-reseed.sh preflight`, review the output, then `... reset` (type the DB name). Follow `docs/release/prod-reseed.md` (verify: 5 users, 3 shifts, shift-1 open, 5 logins). Then set the board task Done.
3. **Victor: record the Loom** with `docs/loom-script.md`, after the reseed. Paste the link here and mark the task Done.
4. Re-run `/export-transcripts` as the very last step. Verify the session count includes this one and the secret scan is clean, then mark the task Done.
5. Merge `feature/17-final-wrap` (docs only).

## Blockers / waiting
- **Victor decides:** the past-date rule (A / B / C, recommended C = reject on create only; brief in [[Decisions]] "OPEN — Past-dated shifts").
- **Founder (Juan):** export Option C vs D ([[ESCALATION]]). PostHog: wish list only (Trial-Brief:54, not in the spec) → deferred.
- Open product finding: agency document access isn't time-bounded after a filled shift's date ([[Decisions]] "Final MVP pass").
- Open minor: QA-010 (admin users License column shows type, not status), QA-015 (mobile tab bar over the credential form footer), and the P3s in `docs/qa/CANVAS_QA.md`. CD migration smoke check deferred (see Decisions).

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
- **Refresh limits (QA-006 fixed 2026-11-07):** 10 refreshes/min per session family, 300/min per IP, 30 invalid-cookie/min per IP. A scripted run that reloads one session >10×/min gets 429 → the app retries (≤3, ≤10 s waits) then shows "Try again" (status `unavailable`), never `/login`. Use separate logins per parallel worker; tabs of one browser share a token (Web Lock + BroadcastChannel).
- **Real-API E2E:** `pnpm --filter api db:reset`; start the API with `PORT=3201 APP_ORIGIN=http://localhost:3100 pnpm --filter api start:local` (background); then `E2E_REAL_API=1 API_ORIGIN=http://localhost:3201 pnpm --filter web exec playwright test flows`. Mocked suite: `pnpm --filter web test:e2e`.
- **QA script:** `QA_DELAY_MS=7000` on `scripts/qa-responsive.mjs`, or reloads exceed 10 refreshes/min and captures stick on "Loading your session".
- **Rollback test timeout (OPEN, CI risk; did not trip in today's runs):** in `claim-cancel.test.ts` the `trap` tests ("claim: audit insert fails", "cancel: outbox insert fails"; which one varies) can exceed 5 s when test files run in parallel: 8.7 s parallel vs 79 ms with `vitest run --no-file-parallelism`, on an otherwise idle machine, so it is NOT outside load. Root cause not found (Postgres checkpoints were fast, no deadlocks logged). They run DDL (`create trigger`) against a per-file throwaway DB on the shared server. Options: per-test timeout on the trap tests, or `fileParallelism: false` (suite 40 s instead of 15 s).
- **Port 3001 squatter:** a leftover `node dist/server.js` (no `.env` → login 500) can hold 3001; check `Get-NetTCPConnection -LocalPort 3001` before starting the API. The API listens on 127.0.0.1, so PowerShell `Invoke-WebRequest http://localhost:...` may try ::1 and fail — use 127.0.0.1.
- **Modal dialogs + toasts:** use `AppDialog` (Radix). Only the top dialog of `stores/dialogs.ts` `stack` renders the active inline Toaster; the page toaster yields while any dialog is open. Footer buttons are portalled outside `<form>`: give submit buttons `form=`.
- **Tailwind + legacy CSS:** legacy CSS is unlayered and beats Tailwind utilities; migrate whole elements, never mix a legacy class and a utility for one property. No preflight. Shadcn files are in `src/components/shadcn/` (lowercase; `ui/Dialog.tsx` would collide on Windows).
- **Radix in tests:** stub `ResizeObserver` for popovers and menus; Radix menus open on `pointerdown` (`fireEvent.pointerDown`); query content behind a modal with `{hidden:true}`.
- **Chrome extension cannot resize** Victor's window (stays 1699 wide; popups blocked; framing denied). Verify viewports with Playwright Chromium against the dev server and label it as such.
- **Parallel `/verify` runs** (several agents at once) make API rollback tests time out; one run on a quiet machine is green. Run gates one at a time.
- Docker Desktop and the dev servers can disappear mid-session: check `docker ps` and ports 3000/3001 before blaming code.

- **Plan mode stops subagents:** toggling plan mode in the main session makes running subagents halt (they can't edit). Resume them with SendMessage after exiting plan mode.
- **Credential preview locally** needs `CREDENTIAL_STORAGE_ORIGIN=http://localhost:9000` in the web env at build/dev start (CSP `connect-src`). Playwright's bundled Chromium has no PDF viewer: PDF preview is only verifiable in real Chrome.
- **Prod DB errors log at INFO:** the `DrizzleQueryError` "Failed query" lines appear as `[INFO]` in Railway, so an error-level filter shows nothing for a 500. Search the logs for `Failed query` / `"code":"4`.
- **Auto-mode classifier blocks prod reads too:** `railway variables` (prints secrets) and `railway ssh ... psql` against prod were denied. Victor runs them (`! <command>`) or adds an allow rule.
- **R2 CORS AllowedOrigins must not end with `/`:** the browser's Origin has no trailing slash and R2 compares exactly.
- **Email HTML:** one `layout()` in `notifications/templates.ts` renders every mail. Preview: render with `tsx` + screenshot with web's Playwright (`createRequire(apps/web/package.json)`); Mailpit `GET /api/v1/message/<id>/html-check` gives caniemail scores (2026-11-10: 88.9% supported). Git Bash heredocs turn `\n` inside Python strings into real newlines: edit TS escapes with the Edit tool.
- **No `gh` CLI:** PRs are created and merged through GitHub in Chrome (compare URL `.../compare/master...<branch>?expand=1`; the merge button is found and clicked via `javascript_tool`). Check status via the public API: `curl -s https://api.github.com/repos/VictorJThomas/ShiftPatch/commits/<ref>/check-runs`.
- **Agents running `db:reset` on the shared local Postgres** can collide with `/verify` or another agent. Run one DB-heavy agent at a time, or accept a re-run.
- **Sonnet subagents can hit a weekly usage limit** mid-task. Resume them with SendMessage; their work is saved.
