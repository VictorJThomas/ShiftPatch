# Requirements Checklist

Legend: ☐ not started · ◐ in progress · ☑ done · ⛔ escalated/not as asked. Update every session.

## Deliverables
- ◐ Deployed app, real URL, seeded ([[Spec-Summary]]) — web https://shiftpatch-web-orcin.vercel.app + API https://api-production-1811a.up.railway.app live (health only); seed + migrations written and verified locally (stage 2), not yet on Railway (no DB there)
- ☑ Repo with passing CI (typecheck + lint + tests), no secrets in history — CI green on PR (typecheck, lint, test, pnpm audit, gitleaks)
- ◐ Agentic setup: CLAUDE.md ☑, second brain ☑ (this vault), custom skills ☑ (`/task`, `/verify`, `/wrap-session` committed `0f830e9`; used plugin skills copied)
- ☐ 5-min Loom for founder
- ☐ Full unedited AI transcripts — export every session
- ☑ Scope-commitment email to recruiter (due day 1) — sent by Victor 2026-11-06
- ☑ ESCALATION.md committed — in first commit `5292609` (2026-11-06 10:53 -0400).

## Founder wish list
| Item | State | Note |
|---|---|---|
| 3 roles with real permissions | ◐ | §7 — actor, `can()` policies, scoped repos built + tested; no real route wired yet (Stage 4) |
| Authentication | ◐ | §6 — login, refresh rotation, reuse detection, logout, `authenticate`/`loadActor` done |
| Credential upload + expiry | ☐ | §9, test IDs |
| Matching blocks lapsed credentials | ☐ | §5.3 |
| Cancellation + no-show | ☐ | §5.4 |
| Email notifications | ☐ | §10, outbox |
| Timesheets | ☐ | [Future] table; `timesheet-table` test ID still required → minimal view |
| Admin dashboard + reporting | ☐ | `admin-dashboard-shift-table` |
| Audit log | ☐ | §11, `audit-log-table` |
| One-click license/TB export | ⛔ | [[ESCALATION]] |
| PostHog analytics | ☐ | no health data in events |
| Deployed to real URL | ◐ | Vercel + Railway live, /api rewrite verified; app features pending |

## Docs done
- ☑ [[docs/market-research]]
- ☑ [[docs/ARCHITECTURE]]
- ☑ [[ESCALATION]]
