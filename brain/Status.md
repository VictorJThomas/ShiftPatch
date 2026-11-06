# Status (overwrite each session — current truth only)

**Last updated:** 2026-11-06

## Where we are
- **Build stage 2 Data done** on branch `chore/2-data-model` (off `master` after PR #1 merge), commits `cf72b44`, `69babbd`, `b56f557`, `2f3c5b5`, `d71c630` (skills copy). Not pushed, no PR yet. All three 2 Data tasks Done (board + [[Tasks]]).
- `apps/api/src/db/`: Drizzle schema (16 tables, `schema/*.ts`), migrations `0000_init`, `0001_audit_log_append_only`, `0002_network_isolation_and_checks`, idempotent `seed.ts`, `migrate.ts`, `client.ts`. Scripts: `pnpm --filter api db:generate | db:migrate | db:seed` (need `DATABASE_URL`).
- `/verify`: **GREEN** (typecheck, lint, test PASS; contract SKIP, no `test:contract` script until stage 3). Vitest: 44 tests in 4 files, DB tests use a throwaway database per file (needs Postgres on `localhost:5432`, compose creds; CI service matches).
- Independent subagent review (`/agent-skills:review` + `/verify`): approved after fixes (completed-status CHECK, tenant FKs for nurse/facility, blank checks, ENABLE ALWAYS triggers). Only low/nit items remain. See [[Decisions]] → Data layer.
- Local dev DB `shiftpatch` migrated (3 migrations) and seeded: 5 users, 2 agencies, 2 credentials, 3 shifts; next generated id `shift-4`.
- Deployed API/web unchanged (health only; Railway has no DB yet, `dist/` does not ship `migrations/`).

## Next step
1. Victor: push `chore/2-data-model`, open PR to `master`, confirm CI green (CI Postgres service is used by the DB tests).
2. Stage 3 ([[Decisions]] → Build order): `packages/contracts` Zod schemas (+ build step so `node dist/server.js` can import it), then auth (login, refresh, logout). Seed logins are ready (all `Trial2026!`).
3. Before first real deploy of data: add Railway Postgres, ship `src/db/migrations` with the API build, run `db:migrate` then `db:seed`; create the non-owner `app` DB role (open item in [[Decisions]]).

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
