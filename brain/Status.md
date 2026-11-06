# Status (overwrite each session — current truth only)

**Last updated:** 2026-11-06

## Where we are
- **Build stage 1 Foundation done** (except CI confirmation) on branch `chore/1-foundations`, pushed (head `96dd518`). pnpm monorepo: `apps/api` (Fastify 5, `GET /api/health`, `{error}` 404/500 handlers, Vitest inject tests), `apps/web` (Next 16 placeholder page, `/api/*` rewrite to `API_ORIGIN`, pinned workspace root), `packages/contracts` (`ErrorBody` only, no build step yet).
- `/verify`: **GREEN** (typecheck, lint, test PASS; contract SKIP — no `test:contract` script until stage 3).
- Docker Compose: Postgres 16, MinIO (Chainguard images), Mailpit — verified healthy, buckets `public-assets` (anon download) + `private-credentials` (private). Copy `.env.example` → `.env`.
- **Deployed:** API https://api-production-1811a.up.railway.app (Railway Hobby, manual `npx @railway/cli up --service api --detach --ci`), web https://shiftpatch-web-orcin.vercel.app (`npx vercel --prod --yes` from repo root). `/api/health` → 200 through both. No DB on Railway yet.
- Board: 0 drift (63/63). Only Foundation task left Active: "CI skeleton…" (awaiting first green GitHub run). See [[Decisions]] → Foundation.

## Next step
1. Victor: open PR `chore/1-foundations` → `master` (https://github.com/VictorJThomas/ShiftPatch/compare/master...chore/1-foundations). CI has **0 runs**: `ci.yml` triggers only on `pull_request` + push to master/main, so the branch push didn't run it.
2. Check the run: repo is **public**, so `curl -s "https://api.github.com/repos/VictorJThomas/ShiftPatch/actions/runs?branch=chore/1-foundations"`. Green → `/task CI skeleton Done`, merge; red → fix (likely pnpm esbuild build-script approval or action versions).
3. Stage 2 ([[Decisions]] → Build order): add Railway Postgres to project `shiftpatch`, Drizzle schema + migrations + idempotent seed ([[Spec-Summary]] exact data). `packages/contracts` needs a build step (or API bundling) before the API imports it — `node dist/server.js` would break otherwise.
4. Optional: connect Railway + Vercel to GitHub for deploy-on-push (Railway: `railway service source connect`). Vercel preview URLs are behind Vercel auth (prod alias public).

## Blockers / waiting
- Founder decision on export (Option C vs D) — see [[ESCALATION]]. Doesn't block core build.
- Victor: visual QA of design canvas; open the PR so CI runs.

## Environment gotchas
Windows 11, memory-constrained. Never run dev servers in foreground; kill orphan `node` first. Project path is OneDrive-synced: pin Turbopack workspace root in config. See global CLAUDE.md. Python 3.14 + Node 26 + pnpm 10.7 + Docker 29 available. `tasks_md.py` keeps the file's CRLF/LF style.
- GitHub repo renamed to `VictorJThomas/ShiftPatch`; local `origin` still points at old `ShiftPatc` (redirect works; repoint blocked by permission classifier — Victor: `git remote set-url origin https://github.com/VictorJThomas/ShiftPatch.git`).
- Railway CLI logged in as victorjthomas01@gmail.com. Use `npx @railway/cli` / `npx vercel` (no global CLIs, no `gh`). `vercel link` adds `.env*` to `.gitignore` and creates `.env.local` — revert/delete.
- Official MinIO Docker images are gone; use Chainguard (distroless: no shell/curl in container).
