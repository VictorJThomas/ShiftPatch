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

## 2026-11-06 — Stage 3 authorization infra (actor, X-Agency-Id, can(), scoped repos)
- Done: `modules/authz/*`, per-module `policy.ts` (shifts, memberships, audit, credentials, admin), scope-required repos (shifts, audit), plugins wired in `app.ts`, `ErrorMessage.agencyRequired`, ARCHITECTURE §7.2 "As built". 87 tests (39 policy matrix, authz integration on real Postgres, scope/repo isolation). Mutation checks (status, role mismatch, header validation, revoked membership) all red.
- Review: `agent-skills:code-reviewer` fresh context, no Critical; 5 Important fixed with tests, rest documented (see [[Decisions]] → Authorization).
- `/verify` GREEN 4/4; `pnpm build` OK.
- Decided: see [[Decisions]] → Authorization (onRequest hooks, role-claim mismatch = 401, memberships only for matching global role, header invalid = 403, viewer excluded from audit/credential reads).
- Board: task "authenticate + loadActor plugins, X-Agency-Id, can() policies" Pending -> Active -> Done (both sides); full `tasks_md.py diff` not rerun (single-row change, Notion query showed it Done).
- Skills copied: none (all used skills already in `.claude/skills/`).
- Open: commit + PR (Victor); Stage 4 handlers; deploy env vars.

## 2026-11-06 — Stage 4a shift listing + creation
- Done: marketplace, matchable, agency list and create routes (routes -> service -> scoped repo -> mapper); `MarketplaceScope`; `shift:list-matchable` policy; pure `isEligible`/`todayIn`/`roleMatchesLicense`; contract additions (optional `facilityId`, start!=end, `invalidFacility`, `ListShiftsQuery`); ~55 new tests (real Postgres) + pure eligibility tests; Postman collection regenerated.
- Verify: `/verify` GREEN 4/4; 3 mutation checks red; review by `agent-skills:code-reviewer` (no Critical, Important items fixed or documented).
- Decided: see [[Decisions]] -> Shift listing + creation (route 6 full Shift, optional facilityId, MarketplaceScope, unknown agency = 403, no-membership create = 403).
- Board: 3 tasks (GET marketplace, POST create, GET agency shifts) Pending -> Done on both sides. "Withdraw route + GET matchable" stays Pending (matchable done, withdraw not). Full `tasks_md.py diff` not rerun; Notion queried, no other drift seen.
- Skills copied: ponytail (to `.claude/skills/ponytail/`); others already present.
- Open: commit + PR (Victor); claim/cancel/withdraw (Stage 4b); deploy env vars.

## 2026-11-06 — Debug: new shift routes 404 in Postman (stale dist)
- Done: `/systematic-debugging`. Symptom: only `/api/health` 200, rest 404 on port 3001. Root cause: server was `pnpm --filter api start` = `node dist/server.js`, and `dist/` predated the shift routes (`dist/app.js` had no `shiftRoutes`; `dist/modules/shifts` had only policy/repository). Fix: rebuilt contracts + api, restarted. Second cause found on restart: `node dist/server.js` loads no `.env` so login returned 500 (`JWT_SECRET` unset); restarted with `--env-file=../../.env`. Verified live: nurse/admin login 200, `GET /api/shifts` 200 exact shape, `?matchable=true` 200, `GET /api/agencies/agency-a/shifts` 200 as admin, no token 401. No code changed.
- Decided: nothing new; gotcha recorded in [[Status]] (Environment gotchas). Offered, not added: a `start:local` script with `--env-file`.
- Review: Stage 4a independent review result already recorded above (APPROVE, no Critical); no agent pending.
- Board: full reconcile run, Notion 65 rows vs `Tasks.md` 65: 0 drift (26 Done match, none Active); `tasks_md.py touch`.
- Skills copied: `systematic-debugging` already in `.claude/skills/` (identical modulo line endings).
- Open: Victor commit + PR for `feature/4-shift-listing`; Stage 4b claim/cancel/withdraw; local API server running in background (kill orphan `node` before next dev start).

## 2026-11-06 — start:local script + server logging
- Done: `apps/api` script `start:local` (tsc build + `node --env-file=../../.env dist/server.js`); `buildApp({ logger })` (off in tests, on in `server.ts`); error handler logs every 5xx with `req.log.error(err)`; startup line `ShiftPatch API listening on http://localhost:<PORT>`. Why: Postman login returned a bare 500 and the terminal showed nothing. Checked on port 3055 with `JWT_SECRET=short`: login 500 body generic, terminal shows `JwtConfigError ... at least 32 bytes` with stack. `/verify` GREEN 4/4.
- Decided: nothing new (gotcha in [[Status]]).
- Board: no task change.
- Open: Victor runs his own `pnpm dev` (tsx watch) on 3001; it reloads with the logger on.

- Follow-up: `pnpm dev` (tsx watch) had no `--env-file`, so Victor login 500 `JwtConfigError` persisted on his 3001 server (stack paths `src/*.ts` = tsx, not dist). Added `--env-file=../../.env` to the `dev` script; login 200 on port 3056. Victor must restart his dev server (package.json changes do not trigger tsx watch).

## 2026-11-06 — Stage 4b: shift claim + cancel
- Done: `claimShift` / `cancelShift` (service, repository SQL, routes), `ineligibility()` + soft-delete handling in `isEligible`, 3 `ErrorMessage` texts, `claim-cancel.test.ts` (23 real-Postgres tests incl. 20 concurrent claims, `FOR SHARE` blocking test, cancel races, trigger-forced rollback). `/verify` GREEN 4/4; mutation-checked; generated SQL reviewed (atomic `UPDATE ... WHERE status='open'`, `FOR SHARE` licenses, `FOR UPDATE` cancel). Fresh-context `agent-skills:code-reviewer`: APPROVE, no Critical; fixed lock-before-authz in cancel + test gaps. ARCHITECTURE §5.4 "As built" + §16.2 status; Requirements-Checklist updated.
- Decided: see [[Decisions]] -> Shift claim + cancel (404 for out-of-network nurse, cancel check order, expired vs none).
- Board: 5 tasks set Done (Tasks.md + Notion), diff 0 drift (65/65).
- Skills copied: none new (using-agent-skills, ponytail, verify, task, postman-export, wrap-session, review already in `.claude/skills/`). Edited the project copy of `postman-export/scripts/export.mjs` (nested-route parsing bug: claim/cancel were reported "not implemented").
- Open: withdraw route; outbox dispatcher/emails; audit wiring for create; claim vs `roleMatchesLicense`; empty-JSON-body parser; nothing committed yet.
- Board (later, same day): added 6 Pending tasks for the 4b remaining risks (2 MVP: claim license-type vs role, empty JSON body on claim; 4 Later: cancel authz-before-validation, audit pending-license flag, nurse overlap exclusion, rejected-license-after-claim). Diff 0 drift (71/71).

## 2026-11-07 — Stage 5a: GET /api/audit-logs
- Done: `GET /api/audit-logs` (authorize -> validate -> scoped keyset query), `AuditLogQuery/Entry/Response` contracts, `redact.ts` (write + read), `auditScopeOf`, `shift.created` audit (createShift now transactional), login rows scoped, `audit-logs.test.ts` (33 real-Postgres tests: admin network / two networks / none / revoked, agency own rows, sibling denial, viewer, multi-agency header, nurse, 403-before-400, filters, from/to, pagination 3+3+1, empty, redaction raw+written, `__proto__`, immutability, real writers login/create/claim/cancel, rollback, soft-deleted shift). `/verify` GREEN 4/4 (281 tests). Postman regenerated. Fresh-context `agent-skills:code-reviewer`: no Critical; fixed authz-before-validation, probe query, redaction gaps, `auditScopeOf` filters. Own tests caught a real leak (`s3Key`) and an over-redaction (`emailSha256`) before review.
- Decided: see [[Decisions]] -> Audit read API (viewer denied, no ip/userAgent, keyset on id, redaction rule).
- Board: GET /api/audit-logs Done, "Audit module wired into every write" Active, +2 Later tasks (audit indexes, scope logout rows). Updated by exact title (4 writes confirmed); full `diff` not re-run afterwards.
- Skills copied: none new (using-agent-skills, verify, review, code-review-and-quality, postman-export, wrap-session already in `.claude/skills/`).
- Open: audit indexes; scope logout/reuse rows; withdraw; emails; audit UI; nothing committed yet. Docker Desktop was off at start (started it).

## 2026-11-07 — Stage 6a web auth + 4c routes + 5b outbox (orchestrated, 3 parallel agents)
- Done: committed Stage 5a on `feature/5-shift-claiming` (`355363f`, /verify GREEN first). New branch `feature/6-web-auth`: design export in `docs/design/{DESIGN.md,screens/}` (`e045fd7`). Three Sonnet agents in git worktrees, merged in order: (1) API `GET /api/me`, withdraw, `GET /api/nurses/me/shifts`, empty-JSON parser; (3) outbox dispatcher + mail transports + `shift.cancelled` template + audit scoping/indexes; (2) web: tokens/font, route groups + shells, login (RHF + contracts zod), Zustand session, api-client, restore, proxy.ts guards, NotificationBanner, agency switcher, logout. Fresh-context `agent-skills:code-reviewer`: no Critical, 4 Important (dispatcher one-tx resend loop; client dropped agency on every 403; restore could wipe a concurrent login; refresh after logout re-applied the token) — all fixed by the owning agents + suggestions (409 retry x3, Secure cookie, cross-tab logout, /api/me 500 without profile, nurse shifts cap). Verify subagent caught one e2e race (count read without poll) — fixed.
- Verified on merged `56e3a2a`: `/verify` GREEN 4/4 (api 319, contracts 93, web 34 unit), `pnpm --filter web build` OK, Playwright 32/32, postman `--check` OK (17 requests), drizzle-kit check OK. Screens compared with Login-Mobile/Desktop, Agency-Switcher, Nurse shell: match (deviations listed in Decisions/Status).
- Decided: see [[Decisions]] -> Web auth + new routes + outbox.
- Board: 10 tasks Done (Tasks.md + Notion), 1 added (GET /api/me). Notion updated by exact row; full `diff` not re-run.
- Skills copied: frontend-design, ui-ux-pro-max, make-interfaces-feel-better, frontend-ui-engineering, api-and-interface-design, playwright-cli, error-handling-patterns, vercel-react-best-practices, accessibility.
- Incidents: worktrees were created from `master` (1f8a9c4) not the current branch; each agent reset/ff to `e045fd7`. A local Tasks.md edit vanished meanwhile and reappeared as Victor's own commit `5cfd698` on `feature/5`; reapplied. Postman script must run via `pnpm --filter api exec tsx ...` (plain node silently skips route discovery and drops 7 routes — caught before commit).
- Open: Mailpit manual smoke; ARCHITECTURE §8.4/§12 "As built" partly in Decisions only; nothing pushed.
- CI fix (same day): `pnpm test` failed on PR (2 outbox tests: rows left `pending`, attempts 0). Root cause (systematic-debugging): fixture relied on `next_attempt_at` default Postgres `now()` (µs) vs dispatcher JS clock (ms, truncated) -> row inserted in the same ms not yet due. Probe: 54/300 inserts ahead of JS time (max 556 µs). Reproduced locally 7/15 runs; after fixing `enqueue` to set `nextAttemptAt` 1 min in the past: 0/15. `/verify` GREEN 4/4.

## 2026-11-07 — Stage 8 security + verification pass (`feature/7-integration-testing-&-security-hardening`)
- Done (commit `e61e62c`): helmet + pino redaction (API), CSP/HSTS/XFO/Referrer headers (web), zod jitless for the CSP, `authz/matrix.test.ts` (95 cells: owner/manager/viewer/other agency/other network, nurse ok/expired, admin in/out/none, revoked, suspended, X-Agency-Id tampering, audit filter tampering, body IDOR on claim, 0 credential routes), `security.test.ts` (headers on 200/401/404, logs leak no password/JWT/cookie/signed URL, nested secrets, SQL params), `e2e/security.spec.ts` (headers + 0 CSP violations signed in), `apps/api/scripts/e2e-flow.mjs`, `docs/security/db-least-privilege.sql`, ARCHITECTURE §15 step 5.
- Verified (executed and inspected): `/verify` GREEN 4/4 (api 421, contract 18, contracts 93, web unit 34). Playwright 34/34 on the prod build. 20 parallel claims: 1×200, 19×409 (exact text), one holder, one `shift.claimed` audit row. Concurrent refresh: one rotation wins, the rest get 409. Auth suite 23/23 (tamper, alg=none, HS512, expired, suspended, reuse → family revoked, Origin, 429, cookie attributes). HTTP flow 29/29 against the built API **running as `shiftpatch_app`** on a fresh seed (agency post → nurse-1 discovers → nurse-2 exact 403 + empty matchable → claim → admin sees filled → cross-agency 403 / header 403 → audit scoping → cancel reopens → tamper/alg-none/no-Bearer 401 → refresh Origin 403/200 → helmet). Server log grep found 0 of 10 secrets, no JWTs, no warn/error lines. Least-privilege probes: DML ok; audit UPDATE/DELETE/TRUNCATE, DDL and drizzle access denied; not superuser; script idempotent; aborts without the password var. `pnpm audit --audit-level=high`: 0 high (2 moderate dev-only: esbuild via drizzle-kit, minimatch via eslint; not reachable at runtime, not upgraded). `--prod`: 0. gitleaks (history all refs + working tree): 0. `pnpm install --frozen-lockfile` OK. Postman `--check` OK. Web build OK.
- Reviewer (fresh `agent-skills:code-reviewer` subagent, `/agent-skills:review` + `/verify`) found 1 Critical: the lockfile was out of sync after I hand-edited the helmet version (fixed). 1 Medium: the zod `new Function` probe vs the prod CSP; reproduced red in Playwright first, then fixed (the first attempt in providers.tsx was too late because zod reads the flag at schema construction). 4 Low: SQL script stop-on-error and password quoting (fixed), drizzle params in 5xx logs (fixed, plus the Postgres value echo found by my own test), one-level redaction (fixed), past-dated shifts claimable (open question). Nits: e2e-flow guards, default port and date (fixed). Accepted: the `unsafe-inline` CSP trade-off. Affected tests re-run green.
- Not verified (no surface): credential upload abuse (no upload route, Stage 7) and UI E2E of the business flow (Stage 6b screens missing; 11 of 15 required test IDs absent (only the 3 login IDs + notification-banner exist): shift-list-item, shift-claim-button, shift-cancel-button, credential-upload-input, credential-expiry-date-input, agency-post-shift-button, agency-post-shift-submit-button, admin-dashboard-shift-table, admin-shift-status-badge, audit-log-table, timesheet-table). Covered at API level by e2e-flow.mjs.
- Decided: see [[Decisions]] → Security pass.
- Board: Security pass → Done. Added "Upload abuse tests … (needs Stage 7 upload route)" and "Decide: reject past-dated shifts…". `diff` = 0 drift (76/76), synced.
- Skills copied: refreshed code-review-and-quality and security-and-hardening (the plugin versions had changed); added `review/review.md`.
- Open: Stage 6b UIs, Stage 7 upload, Playwright vs the real API in CI, applying the DB role on Railway, the past-date decision.

## 2026-11-07 — Production database live (Railway)
- Done: added `MIGRATE_DATABASE_URL` (owner) support to migrate/seed and a pre-deploy `db:migrate` in `railway.json` (merged in PR #8). On prod, over SSH into the containers (private network): migrate + exact seed as owner, `shiftpatch_app` role created and proven (audit_log DELETE and CREATE denied, sees 3 shifts / 5 users), api vars set (`DATABASE_URL` = app role via `${{Postgres.PGHOST}}`, `MIGRATE_DATABASE_URL`, `APP_DB_PASSWORD` set via stdin, `MAIL_TRANSPORT=log`, `MAIL_FROM`, `OUTBOX_DISPATCHER=on`, `COOKIE_SECURE=true`), redeployed. Read-only prod smoke 21/21. Runtime logs clean.
- Incident (mine): the first setup script found no `DATABASE_PUBLIC_URL` (Postgres has no public proxy) and fell through to `railway add --database postgres`, creating a duplicate `Postgres-s4Ve`. With Victor's OK I deleted the service; deleting its empty volume `postgres-volume-mBHD` was blocked by the classifier → Victor removes it. The script was rewritten: SSH/private-network only, never creates services.
- Also fixed earlier: CI gitleaks false positives on the fake wrong-password fixture (`.gitleaksignore` fingerprints + `gitleaks:allow`), commit `91a97ea`.
- Decided: see [[Decisions]] → Production database.
- Board: no status change (prod reseed task stays Pending until the pre-submission check).
- Skills copied: none.
- Open: orphan volume; Vercel rewrite secret header; argon2 cap; Resend; Stage 6b/7.

## 2026-11-07 — QA: seeded-user workflows in Chrome + feature/API/UI audits
- Done: workflow matrix + Chrome runs (one QA subagent per user, sequential): Agency A, Agency B, Nurse 1, Nurse 2, Admin 1. Read-only audits in parallel (spec completeness, API endpoints, static UI/a11y). Playwright viewport sweep 5 widths × 10 routes. Results in `docs/qa/`; roadmap + `docs/stage-6b-feature-ui-plan.md`.
- Defects: QA-001 logout "503" = extension artifact (server and browser saw 204). QA-002 toast timer restart → fixed by a debug subagent in a worktree (TDD), cherry-picked + re-verified. QA-003/004/005 → roadmap. **QA-006 escalated** (refresh 30/IP limiter + restore treats 429 as anonymous).
- Built: local-only `pnpm --filter api db:reset` (drop/create/migrate/seed; guard hardened after independent review: driver-parsed host check, no `?`/`#`).
- Verified: /verify GREEN, web build, Playwright 34/34, pnpm audit clean; independent review approve-with-changes, all changes applied. Local DB restored to the spec seed; prod untouched.
- Decided: audit-first (missing UI = MISSING, not built in the QA loop); db:reset drops the DB instead of truncating (see [[Decisions]]).
- Board: 1 drift fixed (Production DB row missing in Notion); QA task Done; added "Decide QA-006…".
- Skills copied: plan-md (claude-in-chrome is built-in, no files).
- Open: QA-006 decision; Stage 6b/7 build; leftover dir `.claude/worktrees/agent-ad2d6204a290be1d6` (locked files, delete manually); untracked `apps/web/AGENTS.md` (created by `next dev`).

## 2026-11-07 — Stage 6b frontend + Stage 7 credentials (multi-agent)
- Done: all role screens on the real API; `POST/GET /api/nurses/me/credentials`; QA-003/004/005/006; QA defects D1-D3, D6; real-API `flows.spec.ts`, `testids.spec.ts`; report `docs/qa/STAGE6B_VERIFICATION.md`.
- Agents: A foundation, E credentials API, G QA-006, B nurse, C agency, D admin, F independent QA, plus a fresh-context reviewer (2 High found and fixed: toasts inert behind modals, duplicate `notification-banner`).
- Decided: see [[Decisions]] "Stage 6b build" (one-click nurse claim/cancel, native dialog, aws4fetch). Later: `shift-cancel-button` nurse only, agency uses `agency-cancel-shift-button`; inline credential form.
- Verified: `/verify` 4/4, web build, mocked Playwright 44 passed / 6 skipped, real-API flows 6/6, 5-user matrix 25/25.
- Board: 11 rows pushed to Notion. `tasks_md.py diff` NOT re-run after the push. Duplicate Notion row "Production DB: Railway Postgres..." left for Victor. "Upload abuse tests" stays Active (signed links not built).
- Skills copied: web-design-guidelines, browser-testing-with-devtools.
- Open: review M4 duplication, push/PR, R2 env, deploy, Playwright real-API in CI.

## 2026-11-08 — Wrap correction + local DB reset
- Done: board diffed by hand on open tasks (24 local = 24 Notion); "Three roles..." closed on both sides. Local DB reset to the exact seed.
- Correction to the 2026-11-07 entry and earlier chat: the `claim-cancel` rollback timeout is NOT caused by Agent F's load. It reproduces on an idle machine with parallel test files; 469/469 serially. Root cause open, see [[Status]].
- Victor committed and pushed the wrap docs + `start` script change (`--env-file-if-exists`) in `695022e`.
- Board: 1 item fixed. Duplicate Notion row "Production DB: Railway Postgres..." still there for Victor.
- Skills copied: none.
- Open: flaky rollback timeout, PR, R2 env, deploy, Playwright real-API in CI.


## 2026-11-08: Notion design notes (multi-agent)
- Read `ShiftPatch > Notes` in full (5 Gemini toggles, 7 screenshots, 0 comments). Agent Teams unavailable (flag unset): background subagents, `model: sonnet`, each confirmed `claude-sonnet-5-5`; orchestrator relayed via `docs/ui/COMPONENT_CONTRACTS.md`. Agents: Shared Components, Backend, Nurse, Agency, Admin, Integration (e2e + sort), Review-Fix; independent code-reviewer.
- Victor decided: instant claim stays (brief + spec), admin users = view + credential review, credentials = slim strip + modal.
- Review: no critical or security findings; 5 important (admin Sign out off-screen on phones, agency stranded on profile on phones, suspended agencies listed, audit label, page past end) all fixed.
- Results: see [[Status]]. Skill copied into repo: `building-components`. Nothing committed.

## 2026-11-08: R2 production plan
- Read the brain and traced the credential flow. Upload is built; only the bucket + Railway env are missing. The read path (`GET /api/credentials/:id/download-url`, §9.3) was never built and no screen offers the file.
- Wrote `docs/r2-storage-plan.md`: signed 5-minute GET via `aws4fetch`, `Content-Disposition` set at PUT, one shared download button (nurse, admin, agency). Open risk: 10 MB uploads through the Vercel rewrite (documented 4.5 MB function limit) must be tested first.
- Plan only, no app code. Skills already in the repo: `using-agent-skills`, `ponytail`, `plan-md`. No board rows added.

## 2026-11-08/09: Shadcn migration, credentials screen, FilterDropdown, recursive Chrome QA
- Done: checkpoint commit `8809cd3` (Victor approved) after /verify GREEN; API tests now run file by file (rollback test timed out in parallel). Previous agent team was gone; new background subagents, all confirmed `claude-sonnet-5-5`: Shared Components Lead (Tailwind v4 + Radix + Shadcn foundation, AppDialog, FilterDropdown), then Nurse / Agency / Admin in parallel with disjoint file ownership; orchestrator integrated e2e specs, login/role-guard buttons, NurseDetailDialog `blockClose`.
- QA: fresh Sonnet agent in real Chrome, 3 rounds; fixers per defect: QA-007 chips clipped in the filter panel, QA-008 stale expiry error after type switch, QA-009 email broke mid-word, QA-011 36px touch targets (Button sm 44px on touch / small screens), QA-013 admin search 40px. Code review (agent-skills code-reviewer): stacked dialogs gave 2 `notification-banner` (fixed: dialog stack, only top toaster active) and guard missed shell links (fixed: capture-phase link interception).
- Decided: full Shadcn + Tailwind; test IDs only on `/nurse/credentials/new`; native select/date kept (see [[Decisions]]).
- Board: 0 drift; added "Shadcn/Tailwind migration, AppDialog sizes, FilterDropdown, dedicated credential screen + Chrome QA" (Done).
- Skills copied: `shadcn-ui`.
- Open: commit + PR; legacy CSS prune; popstate guard gap; QA-013 not re-measured.

## 2026-11-09 (transcript export)
- Exported 24 Claude Code sessions (raw JSONL, byte-for-byte, + 82 subagent/tool-result files, 125 MB) to `transcripts/` with `transcripts/INDEX.md`. Folder is git-ignored via `.git/info/exclude` (not committed). Secret scan: only local dev creds / placeholders. Re-run the export after the final session before submission.
- Skill created: `export-transcripts` (`.claude/skills/export-transcripts`, script + SKILL.md; default paths, secret-scan step).

## 2026-11-10 — R2 storage + credential download links
- Task "R2 production storage + credential download links" added Active (Tasks.md + Notion, stage 7 Credentials).
- Cloudflare (Brave, claude-in-chrome): created R2 bucket `private-credentials` (public access disabled). Token creation + Railway vars left to Victor (secrets).
- Built plan steps 2-7 of `docs/r2-storage-plan.md` (see [[Status]], [[Decisions]] "R2 download links"). Test fix: credentials.test "own" query now filters `deletedAt` (new soft-delete test leaked into it). New `apps/api/src/lib/storage.test.ts`.
- Checks: /verify GREEN, web 185, Playwright mocked 49/7 skipped, local MinIO smoke all PASS (9 MB). Uncommitted.
- Skills used: using-agent-skills, ponytail, task, verify, postman-export (all already in `.claude/skills`).
- CD: `deploy` job added to `ci.yml` (Railway CLI then Vercel CLI then health smoke, master only, after checks + security). GitHub env `production` created in browser, restricted to `master`. Token pages opened for Victor (Railway project tokens, Vercel tokens). Task "CD pipeline: auto-deploy API + web on master after CI" added Active (stage 8).
- Victor merged PR #13 (R2) and #14 (CD), set the secrets. First CD run green (deploy job included). Prod smoke via alias: all PASS incl. 9 MB upload (no Vercel 413). Test credential soft-deleted with Victor's OK. Tasks "R2 production storage + credential download links" and "CD pipeline..." → Done (Tasks.md + Notion).


## 2026-11-10 (b) Email notifications v2 plan
- Planned email notifications for every role: 6 event emails (E1 shift.posted to eligible nurses, E2/E3 claim to agency + nurse confirmation, E4 existing cancel, E5 credential submitted to admins, E6 credential reviewed) + 5 reminders (S1 expiring 30d/7d, S2 expired, S3 booked nurse license lapses, S4 shift in 24h, S5 unfilled in 24h). Victor picked all three reminder kinds + new-shift emails to eligible nurses only.
- Plan saved: `docs/email-notifications-plan.md` (Victor implements). Key design: `notifications.dedupe_key` + partial unique index (migration 0005), in-process reminder sweep (15 min, pg advisory lock), shared `enqueue`/`recipients` helpers, no credential type or TB data in mail.
- No code changed. Skill used: plan-md (already in `.claude/skills`).

## 2026-11-10 (c) Email v2 built, date range filter, document preview (manager + 2 subagents)
- Done: Sonnet subagent built email v2 per `docs/email-notifications-plan.md` (migration 0005 `dedupe_key`, `recipients.ts`, `enqueue.ts`, 10 new templates, hooks E1/E2/E3/E5/E6, `reminders.ts` S1-S5 wired in `server.ts`, `.env.example`, ARCHITECTURE §10). Manager review found the intro missing from HTML mail + unbounded expired-credential rescan; both fixed. A plan-mode toggle interrupted the agent once; resumed.
- Done: second subagent (frontend-design, make-interfaces-feel-better, using-agent-skills, TDD) replaced Marketplace date chips with Start/End date inputs and added the credential "View file" preview dialog with Download (blob render, CSP `frame-src blob:` + `CREDENTIAL_STORAGE_ORIGIN`). Manager added the `.env.example` line.
- Verify: `/verify` GREEN (typecheck, lint, test, contract) on the combined tree. API 542 tests; web 201 Vitest; mocked Playwright 51 pass / 7 skipped (agent-reported).
- Decided: see [[Decisions]] "Email notifications v2 + date range + document preview".
- Board: 3 tasks added → Done (email v2, date filter, preview); new Pending "Enable credential preview in prod: R2 CORS rule + CREDENTIAL_STORAGE_ORIGIN on Vercel". Diff 0 drift. Notion still has a duplicate "Production DB: Railway Postgres..." row (both Done), left for Victor.
- Skills copied: none needed (all used skills already in `.claude/skills`).
- Open: all work uncommitted; Mailpit smoke not run; preview not tested on Safari/Firefox/real devices; PDF path checked in real Chrome only (Playwright Chromium has no PDF viewer).

## 2026-11-10 (d) Prod rollout: preview CORS, Resend setup, migration 0005 incident
- Done: PR #15 merged + deployed by Victor. Preview CORS error fixed (R2 rule had `https://shiftpatch-web-orcin.vercel.app/` with a trailing slash). Board "Enable credential preview in prod" -> Done.
- Done: Resend checked in Victor's browser (key `shiftpatch` Full access, unused; no domain; account victorjthomas01@gmail.com). Railway `api` vars set via CLI with `--skip-deploys`: MAIL_TRANSPORT=resend, MAIL_FROM=onboarding@resend.dev, EMAIL_REDIRECT_TO=victorjthomas01@gmail.com, REMINDER_INTERVAL_MS=60000. RESEND_API_KEY left to Victor (Claude doesn't enter keys; full key not visible).
- Prod mail test plan given: post shift (agency) -> E1; claim -> E2+E3; cancel -> E4; upload -> E5; review -> E6; shift <24 h -> S4/S5; credential expiring in 5 days -> S1. Outbox check: `select template, recipient_email, status, attempts, last_error from notifications order by created_at desc limit 20`.
- **Incident:** prod credential upload 500. Railway logs (INFO level) show the outbox insert failing with Postgres 42703: `notifications.dedupe_key` missing = migration 0005 not applied in prod. All mail-enqueuing writes are broken. Repo migration/journal verified correct; prod migration table not read (classifier blocked). Board: new Active task "Prod hotfix: apply migration 0005 ...". Fix commands handed to Victor (see [[Status]]).
- Transcripts: /export-transcripts -> 26 sessions, 136 MB, `transcripts/` excluded from git, secret scan: only the local `change-me-to-32+-random-bytes` placeholder. Not the final pre-submission export.
- Board: 0 drift (23 open tasks on both sides). Skills copied: none needed.
- Open: 0005 in prod; RESEND_API_KEY; CD schema check + redirect subject prefix offered, not built.
- 2026-11-10 later: Victor ran `db:migrate` in the prod api container; 0005 applied, credential upload OK. Board "Prod hotfix: apply migration 0005 ..." -> Done.

## 2026-11-10 (e) Branded transactional email templates
- Done: rewrote the shared `layout()` (`apps/api/src/modules/notifications/templates.ts`): table layout, inline CSS, MSO 600px wrapper, hidden preheader, status badge (app `--st-*` tokens, label always shown), facts card with Date/Time first, bulletproof CTA + underlined fallback link, footer, `color-scheme: light`, iOS `format-detection`. Each of the 11 templates got a badge + CTA label; subjects, payload fields, recipients, triggers, dispatcher, transport unchanged. Text body changed only in fact order.
- Logo: official `png/email/logo-horizontal-light-h32@2x.png` (273x64, shown 137x32) copied to `apps/web/public/brand/`, URL = `${APP_ORIGIN}/brand/...`. No appUrl -> text wordmark, no link (tests keep "no https without appUrl").
- Verified: 21 template tests; previews of 16 cases at 640/375 px (logo loads, no horizontal overflow, long names wrap, images-blocked alt text OK); real `smtp` transport -> Mailpit HTML Check 88.9% supported / 6.1% partial / 5% unsupported (progressive extras only); Sonnet code-reviewer: APPROVE, contrast all >= 5.3:1; Optional fixes applied (Outlook button padding on td, link underline, Apple data detectors, preheader spacer). `/verify` GREEN. Commit `5127fdf`.
- Decided: see [[Decisions]] "Branded email layout".
- Board: added "Branded transactional email templates" (Extras) -> Done; 0 drift.
- Skills used: ponytail, using-agent-skills, task, verify, wrap-session (all already in `.claude/skills`); copied: none.
- Open: push + PR; logo 404 in prod until deploy; CTA labels ("Claim this shift", "Review credential") link to the app root, not the item (no deep links by design); no dark-mode logo; Outlook shows square corners.

## 2026-11-10 — Final MVP completion (orchestrated, 4 Sonnet agents)
- Done: PR #16 (branded email) merged and deployed, logo 200 in prod. PR #17 merged and deployed (`0291eec`): license-vs-role claim rule (W1), audit gaps + `access.denied` + `AUDIT_COVERAGE.md` (W1), +24 credential security tests incl. log capture (W2), Playwright e2e CI job + agency-B/admin flows (W3), `[to:]` subject prefix, Loom script, prod reseed script + doc, past-date brief. Canvas visual QA (W4): 0 P1, documented. Fixed 1 integration break: an admin test fixture LPN nurse claimed an RN shift (test changed to an LPN shift, plus a date fix).
- Verified: `/verify` GREEN; PR #17 CI checks + e2e + security green; master deploy green; prod smoke (health, login page, 401 text); prod log `mail transport: resend`.
- Decided: see [[Decisions]] "Final MVP pass (2026-11-10)". CD migration smoke check deferred. Canvas F1/F3 kept, F2 is an adaptation.
- Board: 7 tasks → Done (license/role, audit, signed links, upload abuse, Playwright CI, Timesheets, Visual QA); transcripts → Active. Manual diff, 0 drift.
- Skills copied: none new (task, verify, wrap-session, ponytail, using-agent-skills, export-transcripts already in `.claude/skills`).
- Open: Victor runs the prod mail test, the reseed (gate) and the Loom; past-date decision; founder C/D; transcripts re-export last.
