---
name: task
description: Set a ShiftPatch task's status (Pending / Active / Done), or add a new task, in BOTH brain/Tasks.md and the Notion "Demands board" in one step. Use whenever work on a board task starts or finishes, when the user says "/task", "mark X done", "start X", "I'm working on X", "add a task for X", "move X to Active", or after verifying a deliverable that matches a task title. Use it instead of hand-editing Tasks.md or Notion, so the two never drift.
---

# /task — one-step status sync (Tasks.md + Notion)

The project rule (CLAUDE.md → Tasks) says every task change must land in two places: `brain/Tasks.md` and the Notion Demands board. Doing that by hand is slow and the two drift. This skill does both, in a fixed order, with a script for the local side so the title used for Notion is exact.

## Arguments

`/task <query> <Active|Done|Pending>` — query is any unique piece of the title (case-insensitive).
`/task add "<exact title>" --stage "<stage>" [--scope MVP|Escalated|Later]` — new task.
No status given → infer from the user's words ("start" / "working on" = Active, "finished" / "verified" = Done). Still unclear → ask.

Stages: `0 Planning`, `1 Foundation`, `2 Data`, `3 Auth`, `4 Shifts`, `5 Audit+Notify`, `6 Web UI`, `7 Credentials`, `8 Release`, `9 Delivery`, `Extras`.

## Constants

- Data source: `collection://615ea490-0b1b-4e69-ba8d-70a2c8294ebd`
- Columns: `Task` (title), `Status` (Pending/Active/Done), `Scope` (MVP/Escalated/Later), `Stage` (multi-select, JSON array in SQL).
- Script: `python .claude/skills/task/scripts/tasks_md.py` (run from repo root).

## Steps — set status

1. **Local first** (Tasks.md is the diff-able record):
   `python .claude/skills/task/scripts/tasks_md.py set "<query>" <Status>`
   - Prints `OK <old> -> <new>` and `TITLE: <exact title>`. Use that exact title from here on.
   - Exit 2 = `NO MATCH` or `AMBIGUOUS` with candidates. Pick the one the user meant (ask if not obvious), rerun with a longer query. Do not touch Notion until local succeeded.
2. **Find the Notion row** by exact title, with a bound parameter (titles contain quotes and slashes):
   `notion-query-data-sources` → `{"data":{"data_source_urls":["collection://615ea490-0b1b-4e69-ba8d-70a2c8294ebd"],"query":"SELECT url, \"Task\", \"Status\" FROM \"collection://615ea490-0b1b-4e69-ba8d-70a2c8294ebd\" WHERE \"Task\" = ?","params":["<TITLE>"]}}`
   - 0 rows → retry with `WHERE \"Task\" LIKE ?` and `%<distinctive words>%` (curly vs straight apostrophes differ between the two sides). Still 0 → the row is missing: create it (see Add, step 2) and log the drift.
   - >1 rows → duplicate cards; update all, tell the user.
3. **Update Notion**: `notion-update-page` with `page_id` = row url, `command: "update_properties"`, `properties: {"Status": "<Status>"}`.
4. **Report** in one line: `<title>: <old> → <new> (Tasks.md ✓, Notion ✓)`. If either side failed, say which, and that the two now disagree — never claim both when one failed.

## Steps — add

1. `python .claude/skills/task/scripts/tasks_md.py add "<title>" --stage "<stage>" [--status S] [--note "Escalated"]` — `--note` only for non-MVP scope or a second stage (`also 8 Release`), matching existing lines.
2. `notion-create-pages` with `parent: {"type":"data_source_id","data_source_id":"615ea490-0b1b-4e69-ba8d-70a2c8294ebd"}`, properties `{"Task": "<title>", "Status": "<S>", "Scope": "MVP", "Stage": "[\"<stage>\"]"}`.
3. Report as above.

## Notes

- Several tasks at once (`/task done X, Y`)? Run the local `set` for each, then one Notion query with `WHERE "Task" IN (?, ?, ...)`, then one update per row.
- Done means verified (tests pass, deploy checked, file exists) — if the user says "done" on something that is plainly unverified, say so in the report but still do what they asked.
- Don't rename a task here. A rename is two edits done deliberately in both places; mention it to the user.
- For a full drift check of the whole board use `/wrap-session` (it runs `tasks_md.py diff`).
