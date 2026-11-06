---
name: verify
description: Run ShiftPatch's quality gates — typecheck, lint, unit/integration tests, and contract tests for the 6 required API routes — and give a short pass/fail summary. Use when the user says "/verify", "run the checks", "is CI green", "does it pass", "check before commit/PR/push", and on your own before marking a build task Done, before committing, and before claiming that code works. The trial grades "verify with real checks", so prefer this over eyeballing.
---

# /verify — quality gates with a short verdict

Same gates as CI (docs/ARCHITECTURE.md §14, Definition of done in §16.2): `pnpm typecheck && pnpm lint && pnpm test`, plus contract tests. The script runs them in order, cheapest first, one at a time (this machine runs out of memory when tsc and vitest run in parallel) and keeps going after a failure so you see every red gate at once.

## Run

From repo root:

```
node .claude/skills/verify/scripts/verify.mjs            # all gates
node .claude/skills/verify/scripts/verify.mjs --skip contract   # no Docker / quick pass
node .claude/skills/verify/scripts/verify.mjs --only lint,typecheck
```

Gate → root `package.json` script: `typecheck` → `typecheck`, `lint` → `lint`, `test` → `test`, `contract` → `test:contract`. A missing script is `SKIP`, not `FAIL` — expected before the monorepo exists. If the script names change, edit the `STEPS` table at the top of `verify.mjs`, don't work around it.

Use a long timeout (`timeout: 600000`). Don't run it in the background — you need the result before saying anything.

## Before the contract gate

Contract tests hit real Postgres (Fastify `inject` against seeded data). If the `contract` (or `test`) gate fails with `ECONNREFUSED`/`connect` errors:
1. `docker compose ps` — is the postgres service up? If not: `docker compose up -d postgres` (never `docker exec -it`).
2. Rerun only that gate: `--only contract`.
That is environment, not a code failure — say so in the report.

## Report

Reply with the table the script prints plus one verdict line, e.g.:

| Step | Result | Note |
|---|---|---|
| typecheck | PASS | 8.2s |
| lint | PASS | 4.1s |
| test | FAIL | 12.9s |
| contract | SKIP | no "test:contract" script |

**RED** — 1 failing gate: `test` → `apps/api/src/shifts/claim.test.ts` "rejects nurse-2": expected 403, got 200.

For each FAIL: name the first real error (file:line + message) from the printed tail, not the whole log. Don't fix anything unless the user asked for a fix — the job here is the verdict. If everything is SKIP, say "nothing to verify yet (no package.json/scripts)" rather than "green".

Never call a run green when a gate was skipped because of an env problem; say which gate did not run.
