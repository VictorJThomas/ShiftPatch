# Requirements Checklist

Legend: ☐ not started · ◐ in progress · ☑ done · ⛔ escalated/not as asked. Update every session.

## Deliverables
- ◐ Deployed app, real URL, seeded ([[Spec-Summary]]) — web https://shiftpatch-web-orcin.vercel.app + API https://api-production-1811a.up.railway.app live **with Railway Postgres: migrations + exact spec seed + least-privilege `shiftpatch_app` (2026-11-07), prod smoke 21/21**. ◐ until the Stage 6b UIs ship; reseed check before submission
- ☑ Repo with passing CI (typecheck + lint + tests), no secrets in history — CI green on PR (typecheck, lint, test, pnpm audit, gitleaks)
- ◐ Security pass (ARCHITECTURE §13–14) — 2026-11-07: helmet + web CSP/HSTS/XFO, pino redaction, authz matrix, IDOR/X-Agency-Id tampering, token tampering, 20-claim concurrency, DB least-privilege script verified, `pnpm audit` 0 high, gitleaks 0. Upload abuse tests wait for the Stage 7 upload route; UI E2E waits for Stage 6b
- ◐ Agentic setup: CLAUDE.md ☑, second brain ☑ (this vault), custom skills ☑ (`/task`, `/verify`, `/wrap-session` committed `0f830e9`; used plugin skills copied)
- ☐ 5-min Loom for founder
- ☐ Full unedited AI transcripts — export every session
- ☑ Scope-commitment email to recruiter (due day 1) — sent by Victor 2026-11-06
- ☑ ESCALATION.md committed — in first commit `5292609` (2026-11-06 10:53 -0400).

## Founder wish list
| Item | State | Note |
|---|---|---|
| 3 roles with real permissions | ☑ | Server-side `can()` policies + scoped repos (tested); 6b UI per role, X-Agency-Id switch clears the old agency cache (2026-11-07) |
| Authentication | ☑ | §6 — API: login, refresh rotation, reuse detection, logout, `GET /api/me`. Web (2026-11-07): login page, Zustand session (token in memory), session restore, api-client single-flight refresh, logout, cross-tab sign-out; Vitest + Playwright |
| Credential upload + expiry | ☑ | `POST/GET /api/nurses/me/credentials` (multipart, 10 MB 413, sniffed 415, private bucket, tx + audit); dedicated `/nurse/credentials/new` form holds both test IDs (2026-11-08, overview has none). Prod needs R2 env (503 until set) |
| Matching blocks lapsed credentials | ☑ | §5.3 — matchable filter + claim 403 (exact texts), `isEligible`/`ineligibility` unit-tested |
| Cancellation + no-show | ☑ | API + emails; nurse one-click advance cancel, agency cancel with reason (no-show/advance), withdraw (2026-11-07) |
| Email notifications | ☑ | §10 — outbox dispatcher (lease-based claim, backoff, max 5), `shift.cancelled` template, log/smtp(Mailpit)/resend transports; manual Mailpit smoke still to do |
| Timesheets | ◐ | Minimal view: `timesheet-table` with header + empty state / completed shifts; full clock-in/out is Extras |
| Admin dashboard + reporting | ☑ | Coverage dashboard: stat tiles, by-agency fill rate, filters, pagination, 15 s polling, `admin-dashboard-shift-table` + badges (2026-11-07) |
| Audit log | ☑ | API + `/admin/audit` (`audit-log-table`, filters incl. agencyId QA-005, Load more) (2026-11-07) |
| One-click license/TB export | ⛔ | [[ESCALATION]] |
| PostHog analytics | ☐ | no health data in events |
| Deployed to real URL | ◐ | Vercel + Railway + Postgres live and seeded (2026-11-07), all 6 API routes work in prod; feature UIs pending |

## Docs done
- ☑ [[docs/market-research]]
- ☑ [[docs/ARCHITECTURE]]
- ☑ [[ESCALATION]]
