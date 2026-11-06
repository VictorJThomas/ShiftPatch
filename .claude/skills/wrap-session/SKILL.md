---
name: wrap-session
description: Close a ShiftPatch work session properly — overwrite brain/Status.md, append brain/Session-Log.md, tick brain/Requirements-Checklist.md, record new decisions, then reconcile brain/Tasks.md against the Notion Demands board and fix drift. Use when the user says "/wrap-session", "wrap up", "end session", "let's stop here", "update the brain", "save progress", "sync the board", or before a /clear or a long break, and after a major milestone (CLAUDE.md asks for incremental brain updates).
---

# /wrap-session — brain update + board reconcile

CLAUDE.md requires, before a session ends: overwrite `Status`, append `Session-Log`, tick `Requirements-Checklist`, record `Decisions`, and reconcile the task board. The next session starts cold and reads only the brain, so whatever is not written here is lost. Write for that reader: current truth, concrete next step, no narrative.

Run from repo root. Work through the steps in order; steps 1–2 gather facts, 3–7 write.

## 1. Gather what happened

- This conversation: what was built, decided, verified, left open.
- `git status --short` and `git log --oneline -15` — commits this session, uncommitted work.
- Was code touched this session? If yes and `/verify` has not run since the last change, run `node .claude/skills/verify/scripts/verify.mjs --skip contract` (contract too if Docker is up) and keep the verdict for Status.
- `ls .claude/skills` vs. skills used this session — CLAUDE.md requires a copy of each used skill (from `~/.claude/skills` or the plugin cache). Copy missing ones now.

## 2. Reconcile the task board

1. Query all rows:
   `notion-query-data-sources` → `{"data":{"data_source_urls":["collection://615ea490-0b1b-4e69-ba8d-70a2c8294ebd"],"query":"SELECT url, \"Task\", \"Status\", \"Scope\", \"Stage\" FROM \"collection://615ea490-0b1b-4e69-ba8d-70a2c8294ebd\""}}`
2. Save the raw JSON result to the scratchpad (e.g. `<scratchpad>/notion.json`) with Write, then:
   `python .claude/skills/task/scripts/tasks_md.py diff <scratchpad>/notion.json`
3. Resolve every line it prints:
   - `STATUS (local ahead)` → push local status to Notion (`notion-update-page`, `update_properties`).
   - `STATUS (notion ahead)` → Victor moved the card; pull it: `tasks_md.py set "<title>" <Status>`.
   - A status going *backwards* (Done → Pending/Active) on either side, or anything you can't explain → ask Victor, don't guess.
   - `ONLY_LOCAL` → create the Notion row (see `/task` → Add). `ONLY_NOTION` → `tasks_md.py add` under its Stage.
   - Title near-duplicates (curly vs straight quote) are the same task — fix the title on the side that's off.
4. Also check reality vs. both sides: work finished this session (a commit, a file, a passing gate) whose task still says Pending/Active → set it via `/task` steps. Example: a commit exists but "First git commit" is Pending.
5. Rerun `diff` until it prints `0 drift`, then `tasks_md.py touch` (updates "Last synced").

## 3. Requirements-Checklist

Tick items (`☐` → `◐` → `☑`, `⛔` escalated) in `brain/Requirements-Checklist.md` that this session moved. Edit in place; keep notes short.

## 4. Decisions

New locked choice this session (tech, naming, convention, scope)? Append to `brain/Decisions.md` in its existing format with a one-line why. Nothing new → skip. Don't re-open existing decisions.

## 5. Status.md — overwrite

Keep its section layout exactly:

```
# Status (overwrite each session — current truth only)

**Last updated:** YYYY-MM-DD

## Where we are
- <3–6 bullets: state of the repo/app NOW, incl. last /verify verdict and deploy state if any>

## Next step
1. <the very next concrete action, specific enough to start cold>
2. ...

## Blockers / waiting
- <who/what, link to note>

## Environment gotchas
<keep existing line; add new gotchas found this session>
```

Remove stale facts (e.g. "no commits" once commits exist). Current truth only — history goes in the log.

## 6. Session-Log.md — append

Append at the bottom, never edit old entries:

```
## YYYY-MM-DD — <topic>
- Done: ...
- Decided: ... (see [[Decisions]])
- Board: <n drift items fixed / none>
- Skills copied: <names / none>
- Open: ...
```

## 7. Report to Victor

Short: what the brain now says is next, drift fixed, verify verdict, and reminders that only he can do:
- export this session's transcript (graded deliverable: "Full unedited AI transcripts");
- uncommitted brain/code changes → offer to commit (don't commit unasked).

Use `[[wikilinks]]` in brain notes. Never delete a note — archive to `brain/archive/`.
