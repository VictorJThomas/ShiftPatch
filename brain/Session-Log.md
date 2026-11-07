# Session Log (append-only, newest at bottom)

Format: `## YYYY-MM-DD — topic` then bullets: done / decided / open. Keep short; details live in the topical notes.

## 2026-11-06 — Planning docs (earlier sessions)
- Wrote [[docs/market-research]], [[docs/ARCHITECTURE]], [[ESCALATION]] (export feature escalated).
- Decided: Fastify + Next.js + Postgres/Drizzle, Vercel→Railway rewrite. See [[Decisions]].

## 2026-11-06 — Second brain setup
- Created Obsidian vault at repo root: `brain/` notes + `docs/original/` (brief + tech spec copies). Added `.obsidian/app.json`, `.gitignore`.
- Wrote `CLAUDE.md` with rule: consult `brain/00-Index.md` first, never rely on memory, update brain every session.
- Open: first git commit; recruiter scope email; start build step 1.

## 2026-11-06 — Brand + screens design (Claude)
- Built Design canvas artifact "ShiftPatch Brand & Screens": https://claude.ai/artifact/Ne26GGFRtTZZhUstJ7K72y (private; share from page menu).
- 25 artboards: brand sheet, login (mobile/desktop), toast, 8 nurse boards (mobile 390 + scale-up), 7 agency boards, 6 admin boards. Sample data used exactly as in the brief.
- Tokens exported to `docs/design/tokens.css` (CSS vars, light + `[data-theme="dark"]`, icon masks, components). Scoped on `.sp` in the canvas; re-scope to `:root` in Next.js.
- Not verified by render (type's rule: no screenshots unless asked). Visual QA still open.

## 2026-11-06 — Task sync + skills rule
- CLAUDE.md: added rules (1) copy used skills into `.claude/skills/`, (2) sync `brain/Tasks.md` ↔ Notion Demands board on every task change.
- Notion: added `Stage` multi-select (0 Planning … 9 Delivery, Extras) and `Scope=Later`; tagged the 12 existing tasks; created 47 new ones from ARCHITECTURE §16.2 build order (59 total). Mirrored in [[Tasks]].
- Copied skills to `.claude/skills/`: caveman, ponytail, using-agent-skills (`/init` has no files; CLAUDE.md written by hand).
- Open: Notion board has "Escalated" on PostHog (as pre-set by Victor); first commit still pending.

## 2026-11-06 — Project skills: /task, /verify, /wrap-session
- Done: wrote 3 skills in `.claude/skills/` with scripts: `task/scripts/tasks_md.py` (list/find/set/add/diff/touch on Tasks.md), `verify/scripts/verify.mjs` (sequential gates, SKIP when script missing). Smoke-tested on copies: ambiguous match exits 2, curly/straight apostrophe titles match, CRLF kept, verify RED path exits 1.
- Decided: root script names `typecheck`/`lint`/`test`/`test:contract`; reconcile rules (see [[Decisions]] → Agentic workflow). CLAUDE.md rules now reference the skills.
- Board: fixed drift — "First git commit" was Pending but commit `5292609` exists with ESCALATION.md → Done (both sides). "Agentic setup" → Active. Full diff after: 0 drift (63/63).
- Skills copied: skill-creator (used to build these). Formal eval loop skipped: test runs would write to the live Notion board; scripts tested directly instead.
- Open: commit the skills; mark agentic task Done after commit.

## 2026-11-06 — Stage 1 Foundation (orchestrated subagents)
- Done: orchestrator (Opus) + 5 Sonnet subagents with assigned skills: A monorepo+health (ponytail, incremental-implementation, TDD, source-driven), B compose (ponytail, source-driven), C CI (ponytail, ci-cd, security), D Railway (ponytail, shipping, ci-cd, source-driven), E Vercel (ponytail, shipping, source-driven). Agents never committed or touched the board; orchestrator verified + committed atomically: `0f830e9` skills, `80ba6d6` monorepo, `183f9f8` CI, `010a821` skill copies, `51ea219` compose, `96dd518` railway.
- Verified: `/verify` GREEN; compose healthy + bucket policies; curl `/api/health` 200 + `/api/nope` 404 on Railway and via Vercel rewrite.
- Decided: see [[Decisions]] → Foundation (TS 6, Chainguard MinIO, Railway Hobby + root start script, gitleaks v3).
- Board: tasks moved via `/task` as work started/finished; Done: monorepo, compose, Railway health, Vercel rewrite, Deploy to a URL, Agentic setup. CI still Active. Diff 0 drift (63/63).
- Skills copied: incremental-implementation, test-driven-development, source-driven-development, ci-cd-and-automation, security-and-hardening, shipping-and-launch, build (`build/build.toml`, plugin command).
- Open: confirm first CI run; PR to master; repoint `origin`; stage 2.

## 2026-11-06 — Wrap follow-up: CI trigger
- Done: `/verify` GREEN again (typecheck, lint, test; contract SKIP). Pushed `51ea219`, `96dd518`. GitHub API reachable without auth → repo is public.
- Found: CI has 0 runs — `ci.yml` runs on `pull_request` and push to master/main only; feature-branch push doesn't trigger. Needs PR.
- Board: no task changes since the 0-drift diff; recheck skipped (Notion API rate-limited). CI skeleton stays Active.
- Skills copied: none new.
- Open: Victor opens PR → check run → `/task CI skeleton Done`.

## 2026-11-06 — CI fix on PR
- Bug: PR run failed only in `security` job's "Post setup-node" (`Path Validation Error … no cache is being saved`). Root cause: `cache: pnpm` set but job never runs `pnpm install` → store path missing; setup-node v7 fails the job. All real steps passed.
- Fix: removed `cache: pnpm` from security job (`5d8849f`). Rerun green (run 42251767242). `/task CI skeleton Done` (both sides).
- Skills copied: systematic-debugging.
- Open: Victor merges PR; stage 2.

## 2026-11-06 — Stage 2 Data layer
- Done: Drizzle schema (16 tables, ARCHITECTURE §4.4), 3 migrations (init, audit_log append-only trigger, network isolation + checks), idempotent seed with exact spec data, migrate/seed scripts, 44 DB tests (throwaway DB per file, 20 parallel claims → 1 winner). Dev DB migrated + seeded twice (no duplicates). Process: TDD (RED first for schema, trigger, seed), `/verify` before each of 4 commits.
- Review: independent subagent (`agent-skills:code-reviewer` with `/agent-skills:review` + `/verify`), two rounds. Fixed: `completed` unreachable under filled CHECK (doc §4.4 corrected too), cross-network nurse/facility on a shift (composite FKs), blank-name checks, triggers `ENABLE ALWAYS`, test-db cleanup. Accepted: seed never overwrites drift; superuser dev role can drop triggers (deploy open item).
- Decided: see [[Decisions]] → Data layer (`shift_id_seq` starts at 4, agency users `agency-a`/`agency-b`, throwaway test DBs).
- Board: 3 tasks Active→Done via `/task` (both sides). Final reconcile compared the 63 Notion rows by eye against [[Tasks]] (no `diff` script run; no drift seen).
- Skills copied: constraints, review, constraint-driven-development, code-review-and-quality (also already present: build, incremental-implementation, test-driven-development, using-agent-skills, ponytail, task, verify, wrap-session).
- Gotchas: stray test DB from a failed run was dropped; drizzle-kit mis-orders UNIQUE vs FK in generated SQL; `/constraints` CONSTRAINTS.md interview not done.
- Open: push + PR for `chore/2-data-model`; stage 3 contracts + auth; Railway Postgres + migrations shipping; least-privilege app role; export this session's transcript.

## 2026-11-06 — Stage 3 `packages/contracts`
- Done: Zod contracts for the 6 required routes + error body + exact error texts (`packages/contracts/src/index.ts`), 94 tests (93 in package + 1 api consumer probe) incl. spec fixtures verbatim, missing/invalid/extra keys, date/time formats, `expectTypeOf` inference (checked by tsc). Mutation check: adding a role / extra Shift key turns tests + tsc red. Build to `dist`, workspace deps in api + web, `pnpm build` from clean `dist` OK (api + Next 16).
- Review: fresh `agent-skills:code-reviewer` (`/agent-skills:review` + `/verify`) → APPROVE, 2 Required fixed (web build builds contracts first + CI `pnpm build` step; permanent api consumer test), suggestions fixed (noValidCredential assert, Cancel `toExtend`, dropped `void _omit`). Deferred to handler stage: Fastify empty-JSON-body on claim, login 400 vs 401 (see [[Decisions]] → Contracts). Nit kept: `dist/index.d.ts` emitted but unused (harmless).
- `/verify`: GREEN (typecheck, lint, test; contract SKIP, no `test:contract` yet).
- Decided: request strip / response strict policy, per-route literals, packaging conditions (see [[Decisions]] → Contracts).
- Board: `packages/contracts` Pending→Active→Done via `/task` (both sides); `diff` 0 drift (63/63).
- Skills copied: none new (ponytail, using-agent-skills, task, verify, wrap-session, review already current).
- Open: commit this work; auth (login/refresh/logout) next; Fastify empty-body + login-400 decisions.

## 2026-11-06 — `test:contract` gate + `/postman-export` skill
- Done: root + api `test:contract` (separate vitest config; `pnpm test` excludes `*.contract.test.ts`), 18 contract tests for the 6 routes vs a seeded throwaway DB, auto-skipped per route until its handler exists. Mutation check: a fake login route made the login block go live (3 fail, 1 pass). CI step added. `/verify` now 4/4 GREEN (contract = all skipped for now).
- Done: `/postman-export` skill (made with `/skill-creator`, script self-test chosen over the eval loop by Victor): `scripts/export.mjs` writes `docs/postman/` (collection: 5 logins storing `token`, 6 required routes with contract-schema tests, auto-listed extra routes; local + prod envs). `--check` catches a stale file (mutation tested, exit 1). Embedded schemas validated with Ajv v6 against spec examples (7/7). Not opened in the Postman app itself.
- Decided: see [[Decisions]] → Contracts (contract gate, Postman export).
- Board: 2 tasks added as Done (both sides).
- Skills copied: skill-creator already current; new project skill `postman-export`.
- Open: commit; Postman import smoke test by Victor; run `--check` when routes land.

## 2026-11-06 — Stage 3 auth lifecycle (login, refresh, logout)
- Done: `modules/auth/{tokens,service,routes}.ts` + `modules/audit/audit.ts`; deps `jose`, `@fastify/cookie`, `@fastify/rate-limit`; lazy DB in `buildApp()`; `TRUST_PROXY` hop count; `.env.example` + vitest test secret. 24 auth integration tests on real Postgres (valid/wrong email/wrong password/malformed, suspended, deleted, tampered/alg-none/wrong-key/expired JWT, rotation, reuse → family revoke, grace 409, concurrent refresh 5x → 1 winner, logout vs refresh race, expired refresh, suspended-after-login, Origin 403, cookie attrs incl. Secure, rate limits per IP/email, successes don't count). Mutation checks: removing row/family lock or family revoke → red. Login contract block now live.
- Review: separate `agent-skills:code-reviewer` (via `/agent-skills:review`) → APPROVE WITH CHANGES. Fixed C1, I1, I2, I3, S1, S4 with tests; deferred S2 (XFF spoof via direct Railway), S3 (APP_ORIGIN boot warning), S5 (argon2 threadpool) to Stage 8 — in [[Status]] Next step.
- `/verify`: GREEN 4/4 (api 69 tests, contracts 93, contract 4 pass/14 skip); `pnpm build` OK; `/postman-export --check` OK.
- Decided: see [[Decisions]] → Auth lifecycle (advisory family lock, 10 s grace → 409, failures-only login limit keyed by IP + email hash, malformed login body → 401, secret checked per call, Origin check allows missing Origin).
- Board: 2 tasks Pending → Active → Done via `/task` (both sides); Notion queried, no other drift (65 rows).
- Skills used: ponytail, using-agent-skills, verify, review/code-review-and-quality, task, postman-export, wrap-session — all already in `.claude/skills/`; none copied.
- Open: commit + PR (Victor); `authenticate`/`loadActor`; deploy env vars.
