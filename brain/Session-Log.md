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
