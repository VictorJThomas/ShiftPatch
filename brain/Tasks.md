# Tasks Log (mirror of Notion Kanban)

Board: [Demands board](https://app.notion.com/p/9e958eaa53fe4d479e29d0623c1cf3c2) · parent page [ShiftPatch](https://app.notion.com/p/410c822db4ad80e59c9eef80db90ca69) · data source `collection://615ea490-0b1b-4e69-ba8d-70a2c8294ebd`
Notion columns: `Task` (title) · `Status` (Pending / Active / Done) · `Scope` (MVP / Escalated / Later) · `Stage` (multi-select tag).

## Sync protocol (rule in CLAUDE.md)
- Match rows by **exact title**. Never rename a task in one place only.
- Starting a task: set Status `Active` in BOTH places. Finishing: `Done` in both. New task: add to both, with Stage tag.
- Edit here first (it is the diff-able record), then push to Notion (`notion-update-page` / `notion-create-pages`). If they disagree, read Notion (query rows), reconcile, note it in [[Session-Log]].
- Stage order follows [[docs/ARCHITECTURE]] §16.2 build order. Last synced: 2026-11-06.

Legend: ☐ Pending · ◐ Active · ☑ Done

## 0 Planning
- ☑ Market, competitive & compliance research (docs/market-research.md)
- ☑ System architecture & data model (docs/ARCHITECTURE.md)
- ☑ ESCALATION.md written (bulk license/TB export) · Escalated
- ☑ Brand + 25 screens design canvas and tokens.css
- ☑ Second brain (Obsidian) + CLAUDE.md rules · also 9 Delivery
- ☐ Visual QA of design canvas

## 1 Foundation
- ☑ First git commit (include ESCALATION.md, timestamp is graded)
- ☑ pnpm monorepo: apps/api, apps/web, packages/contracts, TS strict, lint
- ☑ Docker Compose: Postgres 16, MinIO, Mailpit
- ☑ CI skeleton: typecheck, lint, tests, pnpm audit, secret scan
- ☑ Fastify /api/health + first Railway deploy
- ☑ Vercel web deploy + /api/* rewrite to Railway
- ☑ Deploy to a URL · also 8 Release

## 2 Data
- ☑ Drizzle schema + migrations (users, shifts, credentials, audit, outbox...)
- ☑ DB constraints: filled/claimed_by CHECK, partial unique indexes, audit_log append-only trigger
- ☑ Idempotent seed with exact spec data (2 agencies, 2 nurses, admin, 3 shifts)

## 3 Auth
- ☑ packages/contracts: strict Zod schemas for 6 required routes + errors
- ☑ POST /api/auth/login (argon2id, JWT, 401 text, rate limit)
- ☑ Refresh + logout: rotating httpOnly cookie, reuse detection
- ☑ authenticate + loadActor plugins, X-Agency-Id, can() policies
- ☐ Authentication
- ☐ Three roles with real permissions: agency, nurse, admin
- ☑ test:contract gate: seeded-DB harness + 6-route contract suite (skips until handlers exist)

## 4 Shifts
- ☑ GET /api/shifts (full marketplace) + contract mapper
- ☑ POST /api/shifts (agency-scoped, shift-N ids, no mass assignment)
- ☑ GET /api/agencies/:agencyId/shifts (membership/admin only, 403 cross-agency)
- ☑ POST /api/shifts/:id/claim: isEligible + atomic UPDATE, exact 403 text
- ☑ POST /api/shifts/:id/cancel (no-show/advance) + shift_cancellations
- ☐ Withdraw route + GET /api/shifts?matchable=true
- ☑ Contract, authorization and concurrency tests (20 parallel claims) · also 8 Release
- ☑ Shift matching blocks nurses with expired credentials
- ☑ Cancellation and no-show handling
- ☐ Claim: enforce license type vs shift role (CNA nurse can't claim RN shift)
- ☐ Tolerate empty JSON body on POST claim (Fastify FST_ERR_CTP_EMPTY_JSON_BODY -> 400)
- ☐ Cancel: authorize before body validation (403 before 400) · Later
- ☐ Audit shift.claimed: record when a pending license was used · Later
- ☐ Nurse overlapping-shift exclusion (tstzrange constraint) · Later

## 5 Audit+Notify
- ☐ Audit module wired into every write (same transaction)
- ☐ GET /api/audit-logs (admin network scope, agency own rows)
- ☐ Outbox table + in-process dispatcher + Resend/Mailpit cancellation emails
- ☐ Audit log
- ☐ Email notifications

## 6 Web UI
- ☐ Move tokens.css into Next.js, Schibsted Grotesk, route-group layouts
- ☐ Login page, Zustand session, api-client (refresh on 401), route guards
- ☐ Nurse UI: shifts list, claim, my shifts, cancel, lapsed-license fallback
- ☐ Agency UI: own shifts, post-shift form, cancel, agency selector
- ☐ Admin dashboard: shift table + status badges, 15s refetch
- ☐ Audit log page + minimal timesheets view
- ☐ All 15 required data-testid attributes + notification-banner
- ☐ Admin dashboard and reporting
- ☐ Timesheets

## 7 Credentials
- ☐ Credential upload route: private R2/MinIO, sniffed type, 10MB limit
- ☐ Admin credential review queue (verify/reject)
- ☐ Signed 5-min document links, audited views, 404 out of scope
- ☐ Credential uploads with expiry dates
- ☐ One-click export of nurses’ license documents and TB test results for state inspectors · Escalated (see [[ESCALATION]])
- ☐ Warn or unassign when a license is rejected after a claim · Later

## 8 Release
- ☐ Playwright E2E in CI (post, claim, admin table, nurse-2 error banner, cancel)
- ☐ Security pass: headers/CSP, IDOR, token tampering, upload abuse, dep audit
- ☐ Production reseed to exact spec data before submission
- ☐ PostHog analytics setup · Escalated (as tagged on board; no health data in events)

## 9 Delivery
- ☑ Email recruiter scope commitment (day 1)
- ☐ Export full unedited AI session transcripts
- ☐ Record 5-min Loom for the founder (non-technical)
- ☑ Agentic setup: custom skills/commands in .claude/ committed
- ☐ Founder decision on export: Option C vs D (see ESCALATION.md) · Escalated
- ☑ /postman-export skill + committed Postman collection (docs/postman)

## Extras (Scope: Later)
- ☐ Credential summary report (Option C)
- ☐ Scoped, audited, expiring inspection package (Option D)
- ☐ Full timesheets (clock in/out, approval)
- ☐ Facility management + expiry reminder emails
