"""Copy every Claude Code session JSONL for this project (main + subagents + tool-results) byte-for-byte,
and write an INDEX.md listing each session's time span and first user prompt."""
import json, shutil, sys
from pathlib import Path

# Defaults: this repo's Claude Code project folder -> <repo>/transcripts. Override with argv[1] (src), argv[2] (dst).
REPO = Path(__file__).resolve().parents[4]
DEFAULT_SRC = Path.home() / ".claude" / "projects" / "".join(c if c.isalnum() else "-" for c in str(REPO))
src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
dst = Path(sys.argv[2]) if len(sys.argv) > 2 else REPO / "transcripts"
if not src.is_dir():
    sys.exit(f"Session folder not found: {src}")
dst.mkdir(parents=True, exist_ok=True)

rows = []
for f in sorted(src.glob("*.jsonl")):
    sid = f.stem
    shutil.copy2(f, dst / f.name)
    side = src / sid
    n_sub = 0
    if side.is_dir():
        shutil.copytree(side, dst / sid, dirs_exist_ok=True)
        n_sub = len(list((side / "subagents").glob("*.jsonl"))) if (side / "subagents").is_dir() else 0
    first_ts = last_ts = None
    prompt = ""
    lines = 0
    with f.open(encoding="utf-8", errors="replace") as fh:
        for line in fh:
            lines += 1
            try:
                o = json.loads(line)
            except Exception:
                continue
            ts = o.get("timestamp")
            if ts:
                first_ts = first_ts or ts
                last_ts = ts
            if not prompt and o.get("type") == "user" and not o.get("isMeta"):
                c = (o.get("message") or {}).get("content")
                if isinstance(c, list):
                    c = " ".join(p.get("text", "") for p in c if isinstance(p, dict) and p.get("type") == "text")
                if isinstance(c, str) and c.strip() and not c.lstrip().startswith("<"):
                    prompt = " ".join(c.split())[:140]
    rows.append((first_ts or "", last_ts or "", sid, lines, n_sub, f.stat().st_size, prompt))

rows.sort()
out = ["# Claude Code session transcripts (unedited)", "",
       "Raw JSONL copied byte-for-byte from `~/.claude/projects/`. Subagent transcripts live in `<session-id>/subagents/`, large tool outputs in `<session-id>/tool-results/`.", "",
       "| # | Start (UTC) | End (UTC) | Session | Lines | Subagents | Size | First prompt |",
       "|---|---|---|---|---|---|---|---|"]
for i, (a, b, sid, n, s, sz, p) in enumerate(rows, 1):
    p = p.replace("|", "\\|")
    out.append(f"| {i} | {a[:16]} | {b[:16]} | `{sid}.jsonl` | {n} | {s} | {sz/1e6:.1f} MB | {p} |")
(dst / "INDEX.md").write_text("\n".join(out) + "\n", encoding="utf-8")
print(f"{len(rows)} sessions exported to {dst}")
