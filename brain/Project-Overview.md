# Project Overview

## What
ShiftPatch: fictional-brand platform where agencies post open nursing shifts, nurses claim them, admin watches coverage in real time. Built as a **Designli Product Engineer trial** (~8h effort, 7-day window). Founder persona: Juan, ops at a large Florida hospital network. Victor Jose is the engineer.

Positioning (see [[docs/market-research]] §5): multi-agency coordination layer. Hospital network = tenant/buyer; agencies = approved vendors; nurses = shared network roster.

## Hard rules from the brief
- TypeScript. Fictional neutral brand — **never use Designli name/assets**.
- Load sample data **exactly**; implement required routes **exactly**; add the ~15 `data-testid`s ([[Spec-Summary]]).
- Everything else (stack, UI, extra routes, what to cut) is our call.
- Better small and working than big and incomplete. Deployed app must run (non-negotiable).
- Within day 1: email recruiter 2–3 lines "By the deadline I'll deliver up to here." (scope commitment)
- Escalate wish-list items that should not be built as asked via `ESCALATION.md`, committed **immediately** (timestamp is read). Only when genuinely warranted.

## Deliverables (5)
1. Deployed app at real URL with sample data
2. Repo with passing CI (typecheck, lint, own tests; no secrets in git history)
3. Agentic setup as actually used: CLAUDE.md, skills/commands, **this second brain**
4. 5-min Loom for the founder (non-technical, no jargon: what built / not built)
5. Full unedited AI session transcripts (most closely read)

## How it is graded
Automated tests (test IDs + API routes), hands-on click-through, security (OWASP static analysis, dep audit, type check, misuse attempts), code health (7 categories), AI direction quality (transcripts), founder communication (Loom).
Good transcripts: plan before generating, parallel independent work, real verification loop, reusable commands/skills created mid-task. Bad: one-shot accept, error ping-pong, "looks right".
Finalist stage: 10-min present + live small change directed via AI.

## Founder wish list
See [[Requirements-Checklist]]. Export item is escalated: [[ESCALATION]].
