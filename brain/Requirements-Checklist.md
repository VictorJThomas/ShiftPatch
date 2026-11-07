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
| 3 roles with real permissions | ◐ | §7 — actor, `can()` policies, scoped repos built + tested; shift list/create/agency/claim/cancel/withdraw/nurse-shifts wired; web role route groups + guards (UX only) built 2026-11-07; **role × endpoint matrix test (95 cells) green 2026-11-07**; role feature UIs pending |
| Authentication | ☑ | §6 — API: login, refresh rotation, reuse detection, logout, `GET /api/me`. Web (2026-11-07): login page, Zustand session (token in memory), session restore, api-client single-flight refresh, logout, cross-tab sign-out; Vitest + Playwright |
| Credential upload + expiry | ☐ | §9, test IDs |
| Matching blocks lapsed credentials | ☑ | §5.3 — matchable filter + claim 403 (exact texts), `isEligible`/`ineligibility` unit-tested |
| Cancellation + no-show | ◐ | §5.4 — API done incl. emails (dispatcher); nurse/agency cancel UI not built |
| Email notifications | ☑ | §10 — outbox dispatcher (lease-based claim, backoff, max 5), `shift.cancelled` template, log/smtp(Mailpit)/resend transports; manual Mailpit smoke still to do |
| Timesheets | ☐ | [Future] table; `timesheet-table` test ID still required → minimal view |
| Admin dashboard + reporting | ☐ | `admin-dashboard-shift-table` |
| Audit log | ◐ | §11 — `GET /api/audit-logs` built + tested (admin network / agency own rows / nurse 403, filters, cursor, redaction); `audit-log-table` UI not built |
| One-click license/TB export | ⛔ | [[ESCALATION]] |
| PostHog analytics | ☐ | no health data in events |
| Deployed to real URL | ◐ | Vercel + Railway + Postgres live and seeded (2026-11-07), all 6 API routes work in prod; feature UIs pending |

## Docs done
- ☑ [[docs/market-research]]
- ☑ [[docs/ARCHITECTURE]]
- ☑ [[ESCALATION]]
