---
name: export-transcripts
description: Export every Claude Code session of this project (main sessions + subagent transcripts + tool-result files) as raw, unedited JSONL into transcripts/ with an INDEX.md, then scan them for leaked secrets. Use when the user says "export transcripts", "export sessions", "export all sessions as JSONL", "/export-transcripts", or before submission (the trial grades full unedited AI transcripts; brain/Requirements-Checklist.md tracks it).
---

# /export-transcripts — raw session transcripts

The trial deliverable is **full, unedited** AI transcripts. Claude Code already stores each session as JSONL in `~/.claude/projects/<project-path-with-dashes>/`. This skill copies them byte-for-byte, never rewritten or redacted.

## Run

From repo root:

```bash
python -I .claude/skills/export-transcripts/scripts/export_sessions.py            # defaults
python -I .claude/skills/export-transcripts/scripts/export_sessions.py <src> <dst> # override
```

Defaults: src = `~/.claude/projects/C--Users-victo-OneDrive-Documentos-ShiftPatch`, dst = `<repo>/transcripts`. Re-running is safe (overwrites with the latest copies).

Output:
- `transcripts/<session-id>.jsonl` — one per session.
- `transcripts/<session-id>/subagents/*.jsonl` (+ `.meta.json`) — subagent transcripts; `tool-results/` — large tool outputs the session references.
- `transcripts/INDEX.md` — table sorted by start time: start/end (UTC), lines, subagent count, size, first prompt.

The current session is exported only up to the moment of the run. Re-run after the last session before submitting.

## Keep it out of git

`transcripts/` is about 125 MB and is ignored locally through `.git/info/exclude` (no tracked change). Check after running:

```bash
grep -qx "transcripts/" .git/info/exclude || echo "transcripts/" >> .git/info/exclude
git status --short   # must not list transcripts/
```

## Secret scan (always, before handing transcripts over)

```bash
grep -rhoE "(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|ntn_[A-Za-z0-9]{30,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|postgres(ql)?://[^:\"' ]+:[^@\"' \$]{6,}@[^\"' ]*(rlwy|railway|proxy)[^\"' ]*|[A-Za-z_]*(TOKEN|API_KEY|SECRET)[A-Za-z_]*=[A-Za-z0-9_+/-]{24,})" transcripts | sort | uniq -c | sort -rn | head -30
```

Expected hits are local dev values only (`shiftpatch:shiftpatch@localhost`, `change-me-to-32+-random-bytes`, `R2_SECRET_ACCESS_KEY=shiftpatch-secret`). A real key means **rotate it** and tell Victor. Do not edit the transcript, because the deliverable must stay unedited.

## After

Append a line to `brain/Session-Log.md` (sessions count, size, scan result). Tick the transcripts item in `brain/Requirements-Checklist.md` and run `/task "Export full unedited AI session transcripts" Done` only on the final pre-submission export.
