# Status (overwrite each session — current truth only)

**Last updated:** 2026-11-06

## Where we are
- **Build stage 1 Foundation done** on branch `chore/1-foundations`, PR open to `master`, head `5d8849f`, **CI green** (run 42251767242). pnpm monorepo: `apps/api` (Fastify 5, `GET /api/health`, `{error}` 404/500 handlers, Vitest inject tests), `apps/web` (Next 16 placeholder page, `/api/*` rewrite to `API_ORIGIN`, pinned workspace root), `packages/contracts` (`ErrorBody` only, no build step yet).
- `/verify`: **GREEN** (typecheck, lint, test PASS; contract SKIP — no `test:contract` script until stage 3).
- Docker Compose: Postgres 16, MinIO (Chainguard images), Mailpit — verified healthy, buckets `public-assets` (anon download) + `private-credentials` (private). Copy `.env.example` → `.env`.
- **Deployed:** API https://api-production-1811a.up.railway.app (Railway Hobby, manual `npx @railway/cli up --service api --detach --ci`), web https://shiftpatch-web-orcin.vercel.app (`npx vercel --prod --yes` from repo root). `/api/health` → 200 through both. No DB on Railway yet.
- Board: 0 drift (63/63). All 1 Foundation tasks Done. See [[Decisions]] → Foundation.

## Next step
1. Victor: merge PR `chore/1-foundations` → `master` (CI green). CI status for any commit: `curl -s "https://api.github.com/repos/VictorJThomas/ShiftPatch/actions/runs?head_sha=<sha>"` (public repo, no `gh`).
2. Stage 2 ([[Decisions]] → Build order): add Railway Postgres to project `shiftpatch`, Drizzle schema + migrations + idempotent seed ([[Spec-Summary]] exact data). `packages/contracts` needs a build step (or API bundling) before the API imports it — `node dist/server.js` would break otherwise.
3. Optional: connect Railway + Vercel to GitHub for deploy-on-push (Railway: `railway service source connect`). Vercel preview URLs are behind Vercel auth (prod alias public).

## Blockers / waiting
- Founder decision on export (Option C vs D) — see [[ESCALATION]]. Doesn't block core build.
- Victor: visual QA of design canvas.

## Environment gotchas
Windows 11, memory-constrained. Never run dev servers in foreground; kill orphan `node` first. Project path is OneDrive-synced: pin Turbopack workspace root in config. See global CLAUDE.md. Python 3.14 + Node 26 + pnpm 10.7 + Docker 29 available. `tasks_md.py` keeps the file's CRLF/LF style.
- GitHub repo renamed to `VictorJThomas/ShiftPatch`; local `origin` still points at old `ShiftPatc` (redirect works; repoint blocked by permission classifier — Victor: `git remote set-url origin https://github.com/VictorJThomas/ShiftPatch.git`).
- Railway CLI logged in as victorjthomas01@gmail.com. Use `npx @railway/cli` / `npx vercel` (no global CLIs, no `gh`). `vercel link` adds `.env*` to `.gitignore` and creates `.env.local` — revert/delete.
- Official MinIO Docker images are gone; use Chainguard (distroless: no shell/curl in container).
