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
