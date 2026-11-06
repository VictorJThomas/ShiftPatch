#!/usr/bin/env python3
"""Read/edit brain/Tasks.md, the local mirror of the Notion "Demands board".

Line format in Tasks.md:  "- <glyph> <title>[ · <note>]" under "## <stage>" headings.
Glyphs: ☐ Pending · ◐ Active · ☑ Done. Title = text before the first " · ".

Commands (run from repo root, or pass --file):
  list [--json] [--status S]          print parsed tasks
  find <query>                        show tasks matching query (exact > substring > all-words)
  set <query> <Pending|Active|Done>   flip status of the ONE matching task; exit 2 if 0 or >1 match
  add <title> --stage "<stage>" [--status S] [--note "Escalated"]   append under a stage heading
  diff <notion.json>                  compare with Notion rows (JSON list of {Task, Status, ...},
                                      or the raw notion-query-data-sources result with "results")
  touch                               update the "Last synced: YYYY-MM-DD" line to today
"""
import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

GLYPH = {"Pending": "☐", "Active": "◐", "Done": "☑"}
STATUS = {v: k for k, v in GLYPH.items()}
LINE_RE = re.compile(r"^- ([☐◐☑]) (.+?)\s*$")
HEAD_RE = re.compile(r"^## (.+?)\s*$")
SEP = " · "


def norm(s: str) -> str:
    # Notion and the markdown file may differ in quote style / spacing.
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", s).strip().lower()


EOL = "\n"  # set by load(); keeps the file's CRLF/LF style so git diffs stay one line


def load(path: Path):
    global EOL
    raw = path.read_bytes().decode("utf-8")
    EOL = "\r\n" if "\r\n" in raw else "\n"
    lines = raw.splitlines()
    tasks, stage = [], None
    for i, line in enumerate(lines):
        h = HEAD_RE.match(line)
        if h:
            stage = h.group(1).split(" (")[0]  # "Extras (Scope: Later)" -> "Extras"
            continue
        m = LINE_RE.match(line)
        if m and stage:
            body = m.group(2)
            title, _, note = body.partition(SEP)
            tasks.append({"line": i, "stage": stage, "status": STATUS[m.group(1)],
                          "title": title.strip(), "note": note.strip()})
    return lines, tasks


def save(path: Path, lines):
    path.write_bytes((EOL.join(lines) + EOL).encode("utf-8"))


def match(tasks, query):
    q = norm(query)
    exact = [t for t in tasks if norm(t["title"]) == q]
    if exact:
        return exact
    sub = [t for t in tasks if q in norm(t["title"])]
    if sub:
        return sub
    words = q.split()
    return [t for t in tasks if all(w in norm(t["title"]) for w in words)]


def fmt(t):
    return f"{GLYPH[t['status']]} [{t['stage']}] {t['title']}" + (f"  ({t['note']})" if t["note"] else "")


def cmd_list(a, path):
    _, tasks = load(path)
    if a.status:
        tasks = [t for t in tasks if t["status"] == a.status]
    if a.json:
        print(json.dumps([{k: t[k] for k in ("title", "status", "stage", "note")} for t in tasks],
                         ensure_ascii=False, indent=1))
    else:
        for t in tasks:
            print(fmt(t))
        print(f"\n{len(tasks)} tasks")


def cmd_find(a, path):
    _, tasks = load(path)
    hits = match(tasks, a.query)
    for t in hits:
        print(fmt(t))
    if not hits:
        print("no match")
        sys.exit(2)


def cmd_set(a, path):
    lines, tasks = load(path)
    hits = match(tasks, a.query)
    if len(hits) != 1:
        print("AMBIGUOUS" if hits else "NO MATCH", f"for {a.query!r}:")
        for t in hits:
            print("  " + fmt(t))
        sys.exit(2)
    t = hits[0]
    old = t["status"]
    lines[t["line"]] = re.sub(r"^- [☐◐☑]", f"- {GLYPH[a.status]}", lines[t["line"]], count=1)
    save(path, lines)
    # The exact title is printed on its own line so the caller can copy it into the Notion query.
    print(f"OK {old} -> {a.status}")
    print(f"TITLE: {t['title']}")
    print(f"STAGE: {t['stage']}")


def cmd_add(a, path):
    lines, tasks = load(path)
    if any(norm(t["title"]) == norm(a.title) for t in tasks):
        print(f"EXISTS: {a.title}")
        sys.exit(2)
    head = next((i for i, l in enumerate(lines)
                 if (h := HEAD_RE.match(l)) and h.group(1).split(" (")[0] == a.stage), None)
    if head is None:
        print(f"NO STAGE HEADING '## {a.stage}'. Stages: " +
              ", ".join(sorted({t['stage'] for t in tasks})))
        sys.exit(2)
    # insert after the last task line of that section
    j = head + 1
    while j < len(lines) and not HEAD_RE.match(lines[j]):
        j += 1
    k = j
    while k > head + 1 and not lines[k - 1].strip():
        k -= 1
    new = f"- {GLYPH[a.status]} {a.title}" + (f"{SEP}{a.note}" if a.note else "")
    lines.insert(k, new)
    save(path, lines)
    print(f"ADDED under {a.stage}: {new}")


def cmd_diff(a, path):
    _, tasks = load(path)
    raw = json.loads(Path(a.notion_json).read_text(encoding="utf-8"))
    rows = raw["results"] if isinstance(raw, dict) else raw
    notion = {norm(r["Task"]): r for r in rows if r.get("Task")}
    local = {norm(t["title"]): t for t in tasks}
    order = {"Pending": 0, "Active": 1, "Done": 2}
    drift = 0
    for key, t in local.items():
        r = notion.get(key)
        if r is None:
            print(f"ONLY_LOCAL   {t['status']:<7} [{t['stage']}] {t['title']}")
            drift += 1
        elif r.get("Status") != t["status"]:
            ahead = "local ahead" if order.get(t["status"], 0) > order.get(r.get("Status"), 0) else "notion ahead"
            print(f"STATUS       local={t['status']:<7} notion={r.get('Status')!s:<7} ({ahead}) {t['title']}"
                  f"  url={r.get('url', '?')}")
            drift += 1
    for key, r in notion.items():
        if key not in local:
            print(f"ONLY_NOTION  {r.get('Status')!s:<7} {r.get('Stage', '')} {r['Task']}  url={r.get('url', '?')}")
            drift += 1
    print(f"\n{drift} drift item(s); local={len(local)} notion={len(notion)}")
    sys.exit(1 if drift else 0)


def cmd_touch(a, path):
    lines, _ = load(path)
    today = dt.date.today().isoformat()
    for i, l in enumerate(lines):
        if "Last synced:" in l:
            lines[i] = re.sub(r"Last synced: [0-9-]+", f"Last synced: {today}", l)
            save(path, lines)
            print(f"Last synced -> {today}")
            return
    print("no 'Last synced:' line found")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--file", default="brain/Tasks.md")
    sp = p.add_subparsers(dest="cmd", required=True)
    s = sp.add_parser("list"); s.add_argument("--json", action="store_true"); s.add_argument("--status", choices=GLYPH)
    s = sp.add_parser("find"); s.add_argument("query")
    s = sp.add_parser("set"); s.add_argument("query"); s.add_argument("status", choices=GLYPH)
    s = sp.add_parser("add"); s.add_argument("title"); s.add_argument("--stage", required=True)
    s.add_argument("--status", choices=GLYPH, default="Pending"); s.add_argument("--note", default="")
    s = sp.add_parser("diff"); s.add_argument("notion_json")
    sp.add_parser("touch")
    a = p.parse_args()
    path = Path(a.file)
    if not path.exists():
        print(f"{path} not found (run from repo root or pass --file)")
        sys.exit(2)
    {"list": cmd_list, "find": cmd_find, "set": cmd_set, "add": cmd_add,
     "diff": cmd_diff, "touch": cmd_touch}[a.cmd](a, path)


if __name__ == "__main__":
    main()
