# Status (overwrite each session — current truth only)

**Last updated:** 2026-11-06

## Where we are
- Branch `feature/5-shift-claiming` (from master after PR #5). **Stage 4b built, UNCOMMITTED:** `POST /api/shifts/:id/claim` and `POST /api/shifts/:id/cancel` via `claimShift` / `cancelShift` in `apps/api/src/modules/shifts/service.ts` (+ `repository.ts`, `routes.ts`, `eligibility.ts` `ineligibility()`); contracts `ErrorMessage` gained `shiftNotFound` / `shiftNotOpen` / `shiftNotFilled`. Choices + risks: [[Decisions]] -> Shift claim + cancel. Flow: ARCHITECTURE §5.4 "As built".
- `/verify` **GREEN 4/4** after the review fixes (typecheck, lint, test, contract). New `claim-cancel.test.ts` (23 tests, real Postgres, one app+pool per request): 20 concurrent claims = 1x200 + 19x409 + one audit row; same/different nurse races; expired/none/rejected/pending; license UPDATE in flight blocks the claim (`FOR SHARE`); cancel authz matrix; cancel x cancel and cancel x claim races; forced audit/outbox failure rolls back. Stable over 3 runs. Mutation checks (drop `status='open'`, drop `FOR SHARE`) turned tests red. Contract blocks for routes 4 and 5 are now live (18 contract tests pass).
- Independent review (`agent-skills:code-reviewer`): APPROVE, no Critical. Fixed: cancel now authorizes on an unlocked read BEFORE taking the `FOR UPDATE` lock (re-decides on the locked row); exact-recipient outbox assertion; 500 body + 400 message + other-network nurse tests; `ErrorMessage` type test updated. Left as documented: claim ignores `roleMatchesLicense` (matchable list applies it), 400 before 403 on a bad cancel body, audit does not record that a pending license was used.
- Postman collection regenerated (13 requests, `--check` OK). Fixed `export.mjs`: Fastify prints nested routes relative to the parent (`/api/shifts` > `/:id/claim`), so route detection missed them and marked claim/cancel "not implemented"; it now rebuilds the full path from the tree depth.
- Board reconciled: 5 tasks Done (claim, cancel, 20-parallel-claims tests, matching blocks expired credentials, cancellation/no-show handling), 0 drift. Not built: withdraw, audit wired to create/auth writes beyond claim/cancel, outbox dispatcher/emails, `GET /api/shifts/:id/details`.

## Next step
1. Victor: review + commit `feature/5-shift-claiming` (code + `docs/postman/` + `.claude/skills/postman-export` fix + brain), push, PR to `master`, CI green.
2. Stage 4c: `POST /api/shifts/:id/withdraw` (`open -> cancelled`, `shift:manage`, audit `shift.withdrawn`), then Stage 5: wire `recordAudit` into `createShift`, outbox dispatcher + Resend/Mailpit emails for the `shift.cancelled` rows already written, `GET /api/audit-logs`.
3. Decide whether claim should also require `roleMatchesLicense` (reviewer suggestion; today a CNA-typed nurse can claim an RN shift by API) and whether to add the tolerant empty-JSON-body parser (Fastify answers 400 to `Content-Type: application/json` + empty body on claim, Postman/curl risk).
4. Before real deploy (Stage 8): Railway env `JWT_SECRET` (>=32 B), `APP_ORIGIN=https://shiftpatch-web-orcin.vercel.app`, `TRUST_PROXY=2`, `NODE_ENV=production`; secret header from the Vercel rewrite (review S2); argon2 cap (S5).
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
