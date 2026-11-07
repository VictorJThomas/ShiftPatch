# ShiftPatch: Feature Completeness Audit (read-only)

Audited 2026-11-07, branch `qa/10-full-audit` (HEAD `feb5efb` + uncommitted `apps/api/src/db/reset.ts`, `apps/web/AGENTS.md`). Sources: `docs/original/ShiftPatch-Technical-Spec.md` (spec), `docs/original/Trial-Brief.md` (brief), `docs/ARCHITECTURE.md` (arch), `brain/Requirements-Checklist.md`, `ESCALATION.md`, code. Live probes (read-only, no login): `GET https://shiftpatch-web-orcin.vercel.app/login` -> 200, `/api/health` -> `{"status":"ok"}`, `/api/shifts` (no token) -> 401 `{"error":"Unauthorized"}`.

Paths below are relative to repo root `C:\Users\victo\OneDrive\Documentos\ShiftPatch`. `API` = `apps/api/src`, `WEB` = `apps/web/src`.

## 1. Summary

The backend is close to complete for the mandatory API surface. The web UI is the gap: past login, the role areas are placeholders.

| Bucket | Fully | Partially | Broken | Missing | N/A / Escalated |
|---|---|---|---|---|---|
| Mandatory: 6 routes | 6 | 0 | 0 | 0 | 0 |
| Mandatory: seed data | 1 | 0 | 0 | 0 | 0 |
| Mandatory: 15 data-testids | 3 | 1 (`notification-banner`: on login errors only) | 0 | 11 | 0 |
| Mandatory: other (error shape, TS, CI, deploy, agentic setup, transcripts, Loom) | 4 (error shape, TS, CI, deploy infra) | 2 (deployed app works but feature UI missing; agentic setup: AGENTS.md uncommitted) | 0 | 0 in repo (transcripts and Loom are out-of-repo deliverables: not verifiable here, brain marks both ☐) | 0 |
| Founder wishlist (12 items) | 2 (auth, lapsed-credential blocking: backend + login UI) | 6 (roles, cancellation, email, audit log, admin dashboard, deploy) | 0 | 3 (credential upload, timesheets, PostHog) | 1 (one-click export, escalated) |
| Extra functional areas (11) | 1 (deployment) | 6 | 0 | 3 | 1 (TB docs: escalated/partial schema) |

Headline gaps:
- **11 of 15 test IDs are missing.** Automated grader click-throughs for claim, cancel, post shift, admin table, audit and timesheets would fail.
- **No credential upload route** exists, and no file storage code.
- **No timesheets** table, route or UI.
- **No PostHog.**

## 2. Mandatory (technical spec + trial brief deliverables)

### 2.1 Required API routes

| # | Required feature | Role | Required API | Actual API (file) | DB dependency | Status | Evidence | Missing work |
|---|---|---|---|---|---|---|---|---|
| 1 | Login | all | `POST /api/auth/login` -> `{token,user:{id,name,role}}`, 401 `Invalid email or password` | `API/modules/auth/routes.ts:66-76`; text `packages/contracts/src/index.ts:34` | users, user_profiles, refresh_tokens, audit_log | Fully implemented | `API/contract/required-routes.contract.test.ts:99` (401 exact), `API/modules/auth/auth.test.ts:70`; extras: refresh/logout `routes.ts:78,92` | None. The response also sets a refresh cookie, which the spec allows. |
| 2 | List all shifts | any authenticated | `GET /api/shifts` -> `{shifts:[9-field shape]}` | `API/modules/shifts/routes.ts:21-29`, `service.ts:20`, mapper `mappers.ts:16-26` (explicit keys, HH:MM) | shifts, agencies | Fully implemented | contract test `:110` "lists every seeded shift across both agencies, exact shape"; `shifts.test.ts` (28 cases) | None. `?matchable=true` is an additive nurse filter. |
| 3 | Create shift | agency | `POST /api/shifts` -> 201 shape, scoped to caller agency | `routes.ts:41-45`, `service.ts:48-95` (agencyId from actor, not body; audited in tx) | shifts, shift_id_seq, audit_log | Fully implemented | contract `:141` (201, body agencyId ignored), `:149` (400), `:153` (nurse 403) | None. The next id is `shift-4`, not the spec's example `shift-7` (`seed.test.ts:81`), which is only illustrative. |
| 4 | Claim | nurse | `POST /api/shifts/:id/claim`, 403 `Credential expired, cannot claim shift` | `routes.ts:48-54`, `service.ts:103-131` (FOR SHARE on licenses, atomic UPDATE, 409 on race) | shifts, credentials, audit_log | Fully implemented | contract `:160` (nurse-2 exact 403), `:164` (nurse-1 exact 200), `:170` (409/404/401); `eligibility.test.ts` (21); 20-claim concurrency in `claim-cancel.test.ts` | None |
| 5 | Cancel / no-show | agency, admin (no-show/advance); nurse (advance only) | `POST /api/shifts/:id/cancel {reason}` -> shape + `cancellation{reason,previousNurseId}` | `routes.ts:57-63`, `service.ts:175-237`; policy `shifts/policy.ts:35-41` | shifts, shift_cancellations, audit_log, notifications (outbox) | Fully implemented | contract `:178` (400 bad reason), `:182` (no-show exact), `:193` (409 open); `claim-cancel.test.ts` | None. A nurse cannot self-report a no-show; this is a product decision (`policy.ts:38`). |
| 6 | Agency-scoped list | agency (own), admin | `GET /api/agencies/:agencyId/shifts` -> `{agencyId,shifts}` | `routes.ts:32-38`, `service.ts:38-45` | shifts, agency_memberships, network_agencies | Fully implemented | contract `:118` (a -> 1,2), `:126` (b -> 3), `:132` (cross-agency 403, 401) | None |

### 2.2 Seed data (spec vs `API/db/seed.ts`)

| Spec row | seed.ts | Match |
|---|---|---|
| agency-a Sunrise Health Staffing / admin@sunrisehealth.example / (spec password) | `:13` + users `:31`, PASSWORD `:8` (argon2id `:25`) | Exact |
| agency-b Metro Care Partners / admin@metrocare.example | `:14` | Exact |
| nurse-1 Maria Lopez / maria.lopez@example.com / valid, expires 2027-01-01 | `:17`; credential `:48-56` status verified | Exact |
| nurse-2 James Cook / james.cook@example.com / expired 2026-06-01 | `:18` | Exact |
| admin-1 Alex Kim / alex.kim@example.com / admin | `:20`, role `:33` | Exact |
| shift-1 agency-a RN 2026-10-02 19:00-07:00 open | `:62` | Exact |
| shift-2 agency-a LPN 2026-10-03 07:00-19:00 filled nurse-1 | `:63` | Exact |
| shift-3 agency-b RN 2026-10-04 19:00-07:00 open | `:64` | Exact |

Status: **Fully implemented.** The seed adds only structural rows: network, memberships, and a `credentials` row with no file. It is idempotent. Tests: `API/db/seed.test.ts:18-99` (10 cases, including the exact 3 shifts, re-run idempotency and the sequence). According to `brain/Status.md`, the prod DB is seeded and passed a 21/21 read-only smoke test. This audit did not re-verify the seeded prod data with a login.

**Risk:** the uncommitted `API/db/reset.ts` is local-only (`assertLocalDatabase`). The brain warns that the e2e-flow script writes shift-4. Check that prod `shift-1` is still `open` before submitting.

### 2.3 Required data-testids (15)

| test ID | Required UI | Actual (file:line) | Status | Missing work |
|---|---|---|---|---|
| `login-email-input` | login email | `WEB/features/auth/login-form.tsx:67` | Fully | None |
| `login-password-input` | login password | `login-form.tsx:91` | Fully | None |
| `login-submit-button` | login submit | `login-form.tsx:113` | Fully | None |
| `shift-list-item` | each open-shift row/card | MISSING. `WEB/app/(nurse)/nurse/shifts/page.tsx:14` is an EmptyState placeholder; `WEB/app/(agency)/agency/shifts/page.tsx:46` shows only `agency-shift-count` | Missing | Nurse list (matchable + lapsed fallback per arch §12.4) and agency list rows |
| `shift-claim-button` | claim on a shift | MISSING | Missing | Claim button that calls route 4 and shows the banner |
| `shift-cancel-button` | cancel claimed shift | MISSING. `nurse/my-shifts/page.tsx:12` is a placeholder | Missing | Nurse My shifts (advance) + agency list (no-show/advance) |
| `credential-upload-input` | file input | MISSING. `nurse/credentials/page.tsx:12` is a placeholder | Missing | Form + upload route (none exists) |
| `credential-expiry-date-input` | expiry date | MISSING | Missing | Same form |
| `agency-post-shift-button` | opens post form | MISSING | Missing | Agency shifts page |
| `agency-post-shift-submit-button` | submit post form | MISSING | Missing | Agency shifts page |
| `admin-dashboard-shift-table` | admin shift table | MISSING. `WEB/app/(admin)/admin/dashboard/page.tsx:17` "Coverage is coming" | Missing | Table from `GET /api/shifts` (+ polling) |
| `admin-shift-status-badge` | status badge per admin row | MISSING | Missing | Same table |
| `audit-log-table` | audit listing | MISSING. `admin/audit/page.tsx:10` placeholder | Missing | Table from `GET /api/audit-logs` (backend ready) |
| `timesheet-table` | timesheets view | MISSING. `admin/timesheets/page.tsx:10` placeholder | Missing | Minimal table. No backend exists, so it could be derived from filled/completed shifts. |
| `notification-banner` | banner after any action (success + error) | `WEB/components/ui/NotificationBanner.tsx:33`, rendered by `Toaster.tsx:14` in `providers.tsx:25` | Partially | Only `login-form.tsx:43` (`notify.error`) pushes a toast today. No success banner, because there are no claim, post or cancel actions in the UI. Tests: `NotificationBanner.test.tsx`, `e2e/auth.spec.ts:33,45`. |

Count: 3 Fully, 1 Partial, 11 Missing. This matches the "4 of 15 exist" claim. The extra IDs `agency-shift-count` and `active-agency-name` are not required.

### 2.4 Other mandatory items

| Item | Status | Evidence | Missing work |
|---|---|---|---|
| Error shape `{error}` always | Fully implemented | `API/app.ts:105-110` (404 handler + error handler); routes send `{error}` (`shifts/routes.ts:11-14`); contract tests assert the bodies; empty-JSON parser `app.ts:66-71` | None |
| TypeScript | Fully implemented | All `apps/*` and `packages/*` sources are `.ts`/`.tsx`; `typecheck` script in `apps/api/package.json:10`; CI `pnpm typecheck` | None |
| CI green (typecheck, lint, tests) + no secrets | Fully implemented (config) | `.github/workflows/ci.yml`: typecheck, lint, test, test:contract on Postgres service, build; `security` job: `pnpm audit --prod --audit-level high` + gitleaks (full history). The brain records CI green on PR #8. | Not re-run in this audit. Web Playwright (`apps/web/e2e/*`) is not in CI. |
| Deployed app, real URL, sample data, working | Partially implemented | Web 200 + API health ok + 401 shape verified live. Brain: prod seeded, smoke 21/21. | **Brief: "loaded with the sample data and working"**. A clicker can log in but cannot claim, post or view tables. Feature UIs are needed. |
| Agentic setup (CLAUDE.md, skills, second brain) | Partially implemented | `CLAUDE.md`, `brain/`, `.claude/skills/` (29 skills incl. custom `task`, `verify`, `wrap-session`, `postman-export`) | `apps/web/AGENTS.md` is untracked. Commit it or drop it. |
| Full AI transcripts | Not verifiable in repo (out-of-repo deliverable) | `brain/Requirements-Checklist.md`: ☐ | Export every session before submission |
| 5-min Loom for the founder | Not verifiable in repo | Checklist: ☐ | Record it after the UIs exist |
| ESCALATION.md | Fully implemented | `ESCALATION.md` (Problem, Root cause, Alternatives, Recommendation, Impact); checklist says it is in the first commit `5292609` | None |

## 3. Founder wishlist (Trial brief): optional scope, not mandatory failures

The brief says the scope is deliberately "far more than ... eight hours". The items below are judged as product completeness, not as spec failures. The only mandatory overlap is that required test IDs sit on some of these screens (credential form, timesheets, admin, audit).

| Required feature | Role | Required screen/UI | Actual UI (file) | Required API | Actual API (file) | DB/backend dependency | Status | Evidence | Missing work |
|---|---|---|---|---|---|---|---|---|---|
| Three roles with real permissions | all | Role areas + guards | Route groups `(nurse)`, `(agency)`, `(admin)` with layouts; `WEB/features/auth/role-guard.tsx`; `WEB/proxy.ts` | Policy on every route | `API/modules/authz/can.ts`, `scope.ts`, `shifts/policy.ts`, `audit/policy.ts`, `credentials/policy.ts` | users.role, agency_memberships (owner/manager/viewer), network_memberships | Backend: Fully; UI: Partially (guards only, no role features) | `authz/matrix.test.ts` (95-cell role x endpoint matrix), `policy.test.ts`, `scope.test.ts`, `authz.test.ts`; `e2e/auth.spec.ts:104-125` guards | Role feature screens (Stage 6b) |
| Authentication | all | Login, session, logout | `WEB/app/(auth)/login/page.tsx`, `login-form.tsx`, `stores/session.ts`, `lib/api-client.ts` (single-flight refresh), `use-logout.ts` | login/refresh/logout/me | `auth/routes.ts:66,78,92`, `me/routes.ts:11`; rate limits `auth/routes.ts:55-58` | users (argon2id), refresh_tokens (rotation + reuse detection) | Fully implemented | `auth.test.ts`, `me.test.ts`, `session-flow.test.ts`, `api-client.test.ts`, `stores/session.test.ts`, `e2e/auth.spec.ts` (~20 cases) | None |
| Credential upload with expiry | nurse (upload), admin (review) | Upload form with `credential-upload-input` and `credential-expiry-date-input`; list | Placeholder `WEB/app/(nurse)/nurse/credentials/page.tsx:12` | `POST/GET /api/nurses/me/credentials`, download-url, review (arch §8.4) | **None.** Only `credentials/policy.ts` (read policy, no routes) | Schema ready: `credentials` (`db/schema/credentials.ts:7-37`, expiry/TB checks), `files` (`schema/system.ts:6`). No object storage client. | Backend: Missing (schema only); UI: Missing | No route registered in `app.ts:94-97`; the brain lists Stage 7 as not built | Upload route (multipart, size/type limits, private bucket, signed links), list, review queue, UI + 2 test IDs, upload abuse tests |
| Matching blocks lapsed credentials | nurse | Matchable list; banner on 403 | None (nurse list is a placeholder) | Claim 403 + matchable filter | `service.ts:23-35` (matchable), `:111-113` (claim check); `eligibility.ts` | credentials.expires_on/status | Backend: Fully; UI: Missing | `eligibility.test.ts` (21), contract `:160` | Nurse list + lapsed-license fallback (arch §12.4: an empty list for nurse-2 would break the grader's 403 flow) |
| Cancellation and no-show | agency, admin, nurse (advance) | Cancel buttons (`shift-cancel-button`), reason picker | None | `/cancel`, `/withdraw` | `routes.ts:57,66`; `service.ts:137-161,175-237` | shift_cancellations, audit_log, notifications | Backend: Fully; UI: Missing | `claim-cancel.test.ts`, contract `:178-193`, matrix | UI on nurse My shifts + agency list |
| Email notifications | agency managers, nurse | none needed | n/a | outbox dispatcher | `notifications/dispatcher.ts` (lease, backoff, max 5), `templates.ts`, `mail.ts` (log/smtp/resend); started in `API/server.ts:14-18` | notifications table | Partially implemented | `notifications.test.ts`. Only the `shift.cancelled` template exists; nothing on claim or post. The brain says the Mailpit smoke is pending and the prod transport is not confirmed (Resend open). | Claim/post templates if wanted; confirm the prod transport sends real mail |
| Timesheets | admin | `timesheet-table` | Placeholder `WEB/app/(admin)/admin/timesheets/page.tsx:10` | none required | **None** | No `timesheets` table (arch §4.4 marks it `[Future]`; absent from `db/schema/*`). `completed` status exists in the enum (`_common.ts:20`) but nothing sets it. | Missing (arch scopes it as "minimal view") | grep: no route, no table | Minimal table (test ID is mandatory), e.g. derived from filled/completed shifts |
| Admin dashboard with reporting | admin | `admin-dashboard-shift-table` + `admin-shift-status-badge`, polling | Placeholder `admin/dashboard/page.tsx:17` | `GET /api/shifts` suffices; `GET /api/admin/coverage` planned | `GET /api/shifts` exists; **no** `/api/admin/coverage` | shifts | Backend: Partially (raw list only, no aggregates); UI: Missing | `API/modules/admin/policy.ts` exists without routes | Table + badges + counts (client-side counts are enough) |
| Audit log | admin (network), agency (own) | `audit-log-table` | Placeholder `admin/audit/page.tsx:10` | `GET /api/audit-logs` | `API/modules/audit/routes.ts:11`, `service.ts`, `repository.ts`, `redact.ts`; writes in every shift tx + login | audit_log (append-only trigger) | Backend: Fully; UI: Missing | `audit-logs.test.ts` (~30 cases: scope, cursor, redaction, DB rejects UPDATE/DELETE/TRUNCATE) | Table + pagination UI |
| One-click export of license/TB docs | admin | n/a | n/a | n/a | n/a | n/a | Not applicable (Escalated) | `ESCALATION.md`: Option D recommended, awaiting founder decision; checklist ⛔ | Founder decision. Option C summary report is the next step. |
| PostHog analytics | n/a | n/a | **None** | n/a | n/a | n/a | Missing | No `posthog` in any source or package.json; arch §17 lists it as future | Add the SDK in `providers.tsx` with key-action events and no health data |
| Deployed to a real URL | all | n/a | Vercel `https://shiftpatch-web-orcin.vercel.app` | Railway API via `/api` rewrite | `railway.json`, `apps/web/next.config.ts` rewrite | Railway Postgres | Partially implemented (infra Fully; app features partial) | Live probes above; brain smoke 21/21 | Redeploy after the UIs ship; recheck the seed |

### 3.1 Additional functional areas

| Area | Role | Actual UI | Actual API | Status | Evidence | Missing work |
|---|---|---|---|---|---|---|
| Agency management (profile, members, multi-agency) | agency | `agency/profile/page.tsx:19` placeholder; agency switcher `WEB/features/agency/agency-switcher.tsx`, `AgencyShell.tsx:33` | `GET /api/me` memberships; `X-Agency-Id` validated in `authz/plugin.ts`; `memberships/policy.ts`. **No** `GET/PATCH /api/agencies/:id` (arch §8.4) | Backend: Partially; UI: Partially (switcher only) | `e2e/agency.spec.ts` (6), `me.test.ts` | Agency details/edit routes + profile UI (optional) |
| Nurse management (profile, roster) | nurse, admin | `nurse/profile/page.tsx` (name, email, sign out) | `GET /api/me`; **no** `PATCH /api/me/profile`, no admin roster route | Partially (read-only profile) | `me.test.ts` | Optional |
| Admin operations (review credentials, soft-delete, facilities) | admin | none | Withdraw/cancel available to admin; **no** review, `DELETE /api/shifts/:id` or facilities routes | Partially | matrix test admin rows | Optional, except the review queue if uploads ship |
| Shift discovery (nurse) | nurse | Placeholder `nurse/shifts/page.tsx:14` | `GET /api/shifts`, `?matchable=true` (`routes.ts:21-29`), `GET /api/nurses/me/shifts` (`:75`) | Backend: Fully; UI: Missing | `shifts.test.ts` | Nurse list + My shifts (mandatory test IDs) |
| Shift creation (agency) | agency | Agency page shows a count only (`agency/shifts/page.tsx:46`) | `POST /api/shifts` | Backend: Fully; UI: Missing | contract `:141-153` | Post form (2 mandatory test IDs) + full list |
| Claiming | nurse | none | `POST /claim` | Backend: Fully; UI: Missing | contract, concurrency tests | Claim button + banner |
| Credential eligibility | nurse | none | `eligibility.ts` (`roleMatchesLicense` `:36`, `isEligible`, `todayIn` timezone) | Backend: Fully; UI: Missing | `eligibility.test.ts` | Lapsed fallback UI |
| Credential expiry handling (reminders, renewal) | nurse, admin | none | Expiry is enforced at claim time only; no reminder job or renewal upload | Partially (enforcement only) | `service.ts:111-113` | Upload/renewal; reminders optional (arch §17) |
| TB documentation | nurse, admin | none | Schema fields only (`screenedOn`, `tbTestType`, `recheckDueOn`, no clinical result: `credentials.ts:18-20`, check `:31`) | Backend: Partially (schema); UI: Missing; export Escalated | `schema.test.ts`, `constraints.test.ts` | Arrives with the upload route |
| Deployment | n/a | Vercel + Railway | `/api/health` | Fully (infra) | Live probe; `brain/Status.md` | Keep the prod seed pristine |
| Accessibility | all | Labels/`htmlFor` on login, `aria-current` nav, `aria-busy`, `role="status"`, focus return on Escape (`e2e/agency.spec.ts:59`); 48 aria/role attributes in `WEB` | n/a | Partially | No axe/automated a11y test in `apps/web/e2e` | Add an axe check when the feature UIs land |

## 4. Priority of missing mandatory work (for graders' automated flows)

1. **Nurse shift list.** Add `shift-list-item` and `shift-claim-button`, with a success/error `notification-banner`. Include the lapsed fallback so nurse-2 sees open shifts and gets the exact 403.
2. **Nurse My shifts and agency list.** Add `shift-cancel-button`.
3. **Agency post form.** Add `agency-post-shift-button` and `agency-post-shift-submit-button`, plus a success banner.
4. **Admin dashboard.** Add `admin-dashboard-shift-table` and `admin-shift-status-badge`. `GET /api/shifts` already serves the data.
5. **Admin audit.** Add `audit-log-table`. `GET /api/audit-logs` is ready.
6. **Admin timesheets.** Add `timesheet-table` as a minimal view, derived from shifts.
7. **Credential form.** Add `credential-upload-input` and `credential-expiry-date-input`. This needs a new upload route plus storage. The largest backend gap.
8. **Deliverables.** Commit or drop `apps/web/AGENTS.md`, export the transcripts, record the Loom, redeploy, and verify the prod seed.
