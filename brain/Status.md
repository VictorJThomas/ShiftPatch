# Status (overwrite each session — current truth only)

**Last updated:** 2026-11-06

## Where we are
- Branch `feature/3-auth-backend` (from `master` after PR #3 merge). **Auth lifecycle built, uncommitted** (see `git status`).
- `apps/api/src/modules/auth/` (`tokens.ts`, `service.ts`, `routes.ts`) + `modules/audit/audit.ts` (`recordAudit`). Routes live: `POST /api/auth/login`, `/refresh`, `/logout`. Details + trade-offs: [[Decisions]] → Auth lifecycle.
  - Login: argon2id + dummy hash, exact `{token,user}` / exact 401 text, HS256 15-min JWT (`sub`,`role`,`jti`), refresh cookie `sp_refresh` (httpOnly, Strict, Path `/api/auth`, 7d, Secure in prod).
  - Refresh: opaque 256-bit token, SHA-256 stored, rotation under per-family advisory lock, reuse → family revoked, 10 s grace → 409. Logout: idempotent family revoke. Origin check on refresh/logout. Login rate limit 10 failures/min per IP + per email hash.
  - Not built (next task): `authenticate` / `loadActor` plugins — `verifyAccessToken()` exists, no route uses it yet.
- `/verify` **GREEN 4/4**; `pnpm build` OK. Tests: contracts 93, api 69 (24 auth integration on real Postgres, incl. concurrency; mutation-checked: removing the family lock or the family revoke turns tests red). Contract gate: login block live (4 pass), 14 skipped until shift routes exist.
- Independent review (`agent-skills:code-reviewer`): APPROVE WITH CHANGES → C1 (limiter key/cache DoS), I1 (logout/reuse vs rotation race), I2 (count failures only), I3 (grace after logout), S1 (secret check before DB write), S4 (audit reuse once) **all fixed + tested**. Deferred: S2/S3/S5 (see Next step).
- `docs/postman/` regenerated (`--check` OK). Deployed API/web unchanged (health only; Railway has no DB / JWT_SECRET yet).

## Next step
1. Victor: review + commit auth work on `feature/3-auth-backend`, push, PR to `master`, confirm CI green.
2. Stage 3 next task: `authenticate` (Bearer → `verifyAccessToken` → load user, 401 if deleted/suspended) + `loadActor` (memberships, `X-Agency-Id`) + `can()` policies. Then stage 4 shifts (contract blocks auto-activate).
3. Before real deploy (Stage 8): Railway env `JWT_SECRET` (≥32 B), `APP_ORIGIN=https://shiftpatch-web-orcin.vercel.app` (exact: scheme, no trailing slash; Vercel URL, not Railway, since browsers call `/api/*` via the rewrite; unset ⇒ every browser refresh/logout 403; Vercel preview URLs get 403 too; update if a custom domain is added), `TRUST_PROXY=2` (confirm by logging `req.ip` once — Railway XFF behavior unverified), `NODE_ENV=production`. Consider a secret header from the Vercel rewrite so direct Railway calls can't spoof XFF (review S2). Optional: `UV_THREADPOOL_SIZE` / argon2 concurrency cap (S5).
4. Still open from contracts: Fastify empty JSON body on claim (`FST_ERR_CTP_EMPTY_JSON_BODY`). (Login malformed body → decided: 401.)
5. Before first data deploy: Railway Postgres, ship migrations, `db:migrate` + `db:seed`, non-owner `app` DB role.

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
