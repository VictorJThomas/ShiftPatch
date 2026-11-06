# Status (overwrite each session — current truth only)

**Last updated:** 2026-11-06

## Where we are
- Branch `chore/2-data-model`: stage 2 Data committed (`cf72b44`…`ea36d14`), not pushed, no PR. Stage 3 contracts committed `a7c6730`. **Contract gate + `/postman-export` done but uncommitted** (see `git status`).
- `packages/contracts`: Zod schemas for the 6 required routes + `ErrorBody` + `ErrorMessage` texts, one file `src/index.ts`; requests strip unknown keys, responses strict. Exports `development`→src, default→`dist` (build: `pnpm --filter @shiftpatch/contracts build`). Consumed by api + web (workspace deps). See [[Decisions]] → Contracts.
- `apps/api/src/db/`: Drizzle schema (16 tables), migrations `0000`–`0002`, idempotent seed. Local dev DB `shiftpatch` seeded (next id `shift-4`).
- `/verify`: **GREEN 4/4** (typecheck, lint, test, contract). Tests: contracts 93, api 45 (44 DB + 1 consumer probe). `test:contract`: 18 tests in `apps/api/src/contract/`, **all skipped until handlers are registered** (auto-activate per route). CI runs `pnpm test`, `pnpm test:contract`, `pnpm build`.
- `/postman-export` skill: `docs/postman/` collection + local/prod environments generated from contracts + Fastify routes (all 6 required routes flagged "not implemented yet"). Regenerate/`--check` after route or schema changes.
- Independent review of contracts: APPROVE, required items fixed.
- Deployed API/web unchanged (health only; Railway has no DB yet).

## Next step
1. Victor: commit the contract gate + postman work (offered), push `chore/2-data-model`, open PR to `master`, confirm CI green (new `test:contract` + `pnpm build` steps). Optional: import `docs/postman/` into Postman once.
2. Stage 3 auth: `POST /api/auth/login` (argon2id, `jose` JWT, exact 401 text, rate limit) validated with `LoginRequest`/`LoginResponse`; its contract block in `required-routes.contract.test.ts` goes live as soon as the route is registered. Then refresh/logout. Regenerate `docs/postman/`.
3. Handler-stage decisions open ([[Decisions]] → Contracts): Fastify empty JSON body on claim (`FST_ERR_CTP_EMPTY_JSON_BODY`), login malformed body 400 vs 401 text.
4. Before first real deploy of data: Railway Postgres, ship `src/db/migrations` with API build, `db:migrate` + `db:seed`, non-owner `app` DB role.

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
