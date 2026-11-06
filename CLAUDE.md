# CLAUDE.md — ShiftPatch

Designli Product Engineer trial: shift-marketplace app for nursing staffing. Status: planning done, no code yet (see brain).

## Second brain — MANDATORY
The Obsidian vault is this repo root. Entry point: `brain/00-Index.md`.
1. **Start of every session, before any answer or plan: read `brain/00-Index.md`, then `brain/Status.md`.** Follow its read order for the task at hand.
2. **Consult the brain first. Do not rely on memory** (model memory, auto-memory, or earlier chat). If the brain lacks a fact, read the source docs, then write the fact into the brain.
3. **Update the brain every session, before ending:** overwrite `brain/Status.md`, append to `brain/Session-Log.md`, tick `brain/Requirements-Checklist.md`, record new decisions in `brain/Decisions.md`. Do it incrementally after each milestone, not only at the end.
4. Source docs beat summaries: `docs/original/ShiftPatch-Technical-Spec.md` (seed data, routes, test IDs — exact), `docs/ARCHITECTURE.md`, `docs/market-research.md`, `ESCALATION.md`. Fix stale brain notes.
5. Never delete brain notes; archive to `brain/archive/`. Use `[[wikilinks]]`.

## Skills — copy into the repo (rule)
My skills live globally (`~/.claude/skills`, plugin caches). The trial grades the agentic setup, so **whenever a skill is used in this project, copy it into `.claude/skills/<skill-name>/`** (whole folder, if not already there; refresh if the global one changed). Plugin skills: copy the skill folder from the plugin cache, name = skill name without the plugin prefix. Built-in commands with no files (e.g. `/init`) need no copy. Note new copies in `brain/Session-Log.md`.

## Tasks — Notion Kanban sync (rule)
- Kanban = Notion page **ShiftPatch** → inline DB **Demands board** (find it with `notion-search "ShiftPatch"`; data source `collection://615ea490-0b1b-4e69-ba8d-70a2c8294ebd`). Columns: `Task`, `Status` (Pending/Active/Done), `Scope` (MVP/Escalated/Later), `Stage` (multi-select, build stage tags `0 Planning`…`9 Delivery`, `Extras`).
- Local mirror: `brain/Tasks.md`. **Whenever you start, finish, add, or re-scope a task, update BOTH** `brain/Tasks.md` and the Notion row (match by exact title; create the file/row with a `Stage` tag if missing). Set `Active` when you begin work, `Done` when verified.
- Before ending a session, reconcile: query the board, diff against `brain/Tasks.md`, fix drift, log it.

## Hard constraints (from the trial brief)
- TypeScript. Fictional brand — never use "Designli" name/assets.
- Sample data and the 6 required API routes must match the spec **exactly**; all 15 `data-testid`s present.
- Error shape always `{ "error": "<message>" }`.
- Keep secrets out of git. CI (typecheck, lint, tests) must be green. Deployed app must run.
- Export of license/TB docs is escalated, not built as asked (`ESCALATION.md`).
- Every AI session is graded via transcripts: plan before generating, verify with real checks, parallelize independent work.

## Working style
- Code, comments, commits in English. Chat with Victor in Spanish or English as he writes.
- Architecture is approved (`docs/ARCHITECTURE.md`); follow its build order (§16.2). Don't re-litigate decisions.
- Commands (once monorepo exists): `pnpm typecheck && pnpm lint && pnpm test`. Update this section when scripts land.
- Windows: never run dev servers in foreground; check for orphan `node` processes first.
