---
name: plan-md
description: Persist the current plan as a dense, self-contained .md file the user implements himself across sessions. Use when the user says "create an .md file with this plan", "save this plan", "/plan-md", or asks for a plan he will implement later.
---

# plan-md

Victor's workflow: get plan → save as .md → implement himself → return for the next plan. The .md is the cross-session handoff, so it must stand alone — a fresh session with zero context should be able to execute it.

## Where

- Project has a `docs/` dir → `docs/<topic>-plan.md`
- Reachly monolith → `docs/` (existing convention, e.g. `docs/brand-memory-rag-plan.md`)
- Otherwise → project root `<topic>-plan.md`

## Format (caveman-dense, but complete)

```markdown
# <Feature> Plan

## Goal
One paragraph. What exists now, what changes, why.

## Constraints
Bullet list of hard rules (from CLAUDE.md + this conversation). Anything the
user corrected during planning goes here VERBATIM so it survives the session.

## Steps
Numbered. Each step: exact file paths, function names, and the shape of the
change (signature, schema, pseudocode). Enough that no re-discovery is needed.

## Files touched
| File | Change |

## Migrations / config
Full SQL / env vars / dashboard steps if any. Never "run the migration" — paste it.

## Verify
Concrete manual test sequence: commands, URLs, expected output.

## Out of scope
What was explicitly deferred, so the next session doesn't re-litigate it.
```

## Rules

- Self-contained: no "as discussed above", no references to this chat.
- Dense prose, fragments fine, zero filler — but every path, name, and value exact.
- If the plan supersedes an older plan file, note that at the top of the new one and say so to the user (don't delete the old file).
