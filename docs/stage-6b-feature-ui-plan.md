# Stage 6b Feature UI + Stage 7 Credentials Plan

Source: QA run 2026-11-07 (`docs/qa/REMEDIATION_ROADMAP.md` §1–3, §5–6, §8). Not started. Build on branch `feature/6b-feature-ui` cut from `master` after `qa/10-full-audit` merges.

## Execution (2026-11-07, branch `feature/6b-feature-ui` cut from `qa/10-full-audit`)
QA-006 decided by Victor: differentiated limits (see step 0, revised). Orchestrator committed the shared interfaces first (`63d098c`): credential schemas + upload error texts + `AuditLogQuery.agencyId` in `packages/contracts`, `apiFetch` FormData body.

| Wave | Agent | Owns (only these paths) |
|---|---|---|
| 1 | A Foundation | `components/shells/*`, `components/ui/*` (new primitives), `app/globals.css`, `lib/format.ts`, `app/(nurse\|agency\|admin)/layout.tsx` |
| 1 | E Credentials API | `apps/api/src/modules/credentials/*`, `apps/api/src/lib/storage*`, `apps/api/src/app.ts` (register only), api `package.json` (`@fastify/multipart`), `.env.example`, `docs/postman/*` |
| 1 | G QA-006 | `apps/api/src/modules/auth/*`, `apps/web/src/features/auth/session-flow*`, refresh section of `lib/api-client.ts`, `lib/session-channel.ts`, `brain/Decisions.md` rate-limit line |
| 2 | B Nurse | `app/(nurse)/nurse/**`, `features/nurse/**`, `app/(nurse)/nurse.css` |
| 2 | C Agency | `app/(agency)/agency/**`, `features/agency/**`, `app/(agency)/agency.css` |
| 2 | D Admin | `app/(admin)/admin/**`, `features/admin/**`, `app/(admin)/admin.css`, `apps/api/src/modules/audit/*` (QA-005) |
| 3 | F QA (read-only first) | `apps/web/e2e/**`, `docs/qa/**` |
Shared files (`globals.css`, `api-client.ts`, contracts, shells) change only through the orchestrator after wave 1. Agents run targeted typecheck/tests only (no dev servers, no `next build`: memory-constrained machine); the orchestrator integrates each worktree branch, then runs `/verify`, build, Playwright and the seeded-user matrix.

## Goal
The backend is complete for every spec workflow: 6 spec routes, plus withdraw, `GET /api/nurses/me/shifts`, `GET /api/audit-logs` (cursor), `?matchable=true`. All are tested and verified in Chrome. The web app stops after login: nurse, agency and admin pages are placeholders, and 11 of the 15 required `data-testid`s are missing, so the graders' automated test-ID click-through fails. Build the role screens on the existing routes (6b), then the credential upload route + form (7). Do the QA-006 session fix first, because graders reload often from one IP.

## Constraints
- TypeScript strict, English code/comments/commits. Fictional brand; never "Designli".
- The 15 test IDs must match the spec **exactly**, on the element that performs the action: `login-email-input`, `login-password-input`, `login-submit-button` (done), `shift-list-item`, `shift-claim-button`, `shift-cancel-button`, `credential-upload-input`, `credential-expiry-date-input`, `agency-post-shift-button`, `agency-post-shift-submit-button`, `admin-dashboard-shift-table`, `admin-shift-status-badge`, `audit-log-table`, `timesheet-table`, `notification-banner` (done; same ID for success and error, differ by text).
- Error shape is always `{ "error": "<message>" }`. The claim error must surface verbatim: **"Credential expired, cannot claim shift"**.
- Don't change spec route shapes or `docs/original/*`. Extra data goes on separate endpoints (ARCHITECTURE C2).
- **Every new web module that builds zod schemas or imports `@shiftpatch/contracts` must `import "@/lib/zod-csp"` first** (prod CSP has no `unsafe-eval`; `e2e/security.spec.ts` fails otherwise).
- Use `apiFetch(path, { method, body, schema })` from `apps/web/src/lib/api-client.ts` (Bearer, `X-Agency-Id` for agency, refresh on 401). Errors are thrown as `ApiError` with the server text in `.message`. Show errors with `notify.error(err instanceof ApiError ? err.message : "Something went wrong. Try again.")` (pattern: `features/auth/login-form.tsx:43`). Success: `notify.success("Shift claimed")`, etc.
- TanStack Query: agency keys via `agencyKey(agencyId, ...)` (`lib/query-client.ts:28`). Every mutation invalidates the related queries. Only the admin dashboard polls (`refetchInterval: 15000`).
- Design source: `docs/design/screens/*.dc.html` + `docs/design/DESIGN.md` + tokens in `apps/web/src/app/tokens.css`. Use tokens/classes, no new inline colours. Status = icon + label + tint, never colour alone. Touch targets ≥44px.
- Mobile-first: nurse primary on phones. Desktop must be intentional (Nurse-Scale-Up), not a stretched phone.
- Don't delete code or assets Victor may reuse; move them aside.
- After any route/contract change: `/postman-export` and commit `docs/postman/`. Before a commit or Done: `/verify` (typecheck, lint, test, test:contract). Update `/task` (Tasks.md + Notion) per task.
- `next build` rewrites `apps/web/next-env.d.ts`: `git checkout -- apps/web/next-env.d.ts` before committing.
- Open product decision (don't decide in code): past-dated shifts are still offered and claimable (seed dates 2026-10-0x are before today).

## Steps

### 0. QA-006 session robustness — DECIDED 2026-11-07 (supersedes the a/b options below)
Login unchanged (10/min per IP + per normalized email, failures). Valid refresh: 10/min per refresh-token **family** + an IP safety ceiling of 300/min. Invalid/missing refresh cookie: separate per-IP failure limiter. Client: restore once per hydration, single-flight in-tab, cross-tab coordination, 429 keeps the session and honours `Retry-After` with bounded backoff, never infinite, reuse detection preserved.

~~Victor decides between (a) keying the refresh/logout limiter by the refresh-family hash and (b) raising the per-IP cap.~~
- (a) `apps/api/src/modules/auth/routes.ts`: replace `limiter("session-ip", 30, (req) => req.ip)` with a key of `sha256(req.cookies[REFRESH_COOKIE])` when the cookie is present, else `ip:${req.ip}`, max 30. Keep logout on the same limiter. Update `brain/Decisions.md` rate-limit line.
- Client (both options): `apps/web/src/features/auth/session-flow.ts restore()`. When `refreshSession()` throws an `ApiError` with status 429 or ≥500, or a network error, retry up to 2× (honour `retry-after`, cap 5 s) before going anonymous. A 401 still means anonymous.
- Tests: an API test where 31 refreshes from one IP with distinct sessions all succeed (option a); a web `session-flow.test.ts` where restore on 429 then 200 keeps the session.

### 1. Shell fixes every screen inherits
- `components/shells/NurseShell.tsx`: wrap the content in `<main id="main">`. Add a skip link `<a class="skip" href="#main">Skip to content</a>` to all 3 shells (`NurseShell`, `AgencyShell`, `AdminShell`) with a `.skip` class in `globals.css` (visible on focus).
- Nurse scale-up (`globals.css` ~L41-44, design `Nurse-Scale-Up.dc.html`): <700px 1 column + bottom tabs. ≥700px 2-column card grid. ≥1000px 232px left rail nav (replaces the bottom tabs) + 3 columns. Drop the fixed 480px cap.
- Admin shell (`globals.css` ~L86-89): below 960px, collapse the sidebar into a top bar (logo + nav row). Admin `main` gets `max-width: 1440px`.
- `components/ui/EmptyState.tsx`: h3 → h2.
- `components/ui/Toaster.tsx`: always render one visually hidden `<div aria-live="polite" class="sr-only">` that receives the latest success title (QA-003). Keep `role=alert` on errors.

### 2. Nurse marketplace (`app/(nurse)/nurse/shifts/page.tsx` → `features/nurse/`)
- `features/nurse/queries.ts`: `useMatchableShifts()` → `apiFetch("/api/shifts?matchable=true", { schema: ListShiftsResponse })`; `useOpenShifts()` → `GET /api/shifts`, filtered to `status==="open"`; `useClaim()` mutation → `POST /api/shifts/${id}/claim` (`schema: ClaimShiftResponse`), onSuccess `notify.success("Shift claimed")` and invalidate `["shifts"]`, `["nurse","my-shifts"]`; onError `notify.error(err.message)`.
- `features/nurse/ShiftCard.tsx`: root `data-testid="shift-list-item"`. Shows agency, role pill, `Fri, Oct 2 · 19:00 → Sat 07:00` (end < start = next day), "Overnight · 12 h" tag, status badge. Button `data-testid="shift-claim-button"` opens a confirm sheet; confirm calls `useClaim`.
- Filter chips: date (unique dates) + role (All/RN/LPN/CNA), client-side.
- **Lapsed-license fallback (§12.4):** if matchable is `[]` and open shifts exist → show the warning banner "Your license has expired. Upload a renewed license to claim shifts" (link `/nurse/credentials`) **only when** the credential status (step 6 `GET /api/nurses/me/credentials`) shows no valid license. Before step 6 lands, show neutral copy "No shifts match your credentials right now" + the open list. Claim stays **enabled**, and the 403 surfaces as `notification-banner` with the exact server text.
- States: skeleton (`aria-busy`), empty + "Clear filters", error + Retry, offline (`navigator.onLine`).

### 3. Nurse my shifts (`app/(nurse)/nurse/my-shifts/page.tsx`)
- `useMyShifts()` → `GET /api/nurses/me/shifts` (`NurseShiftsResponse`). Same `ShiftCard` variant, with `data-testid="shift-cancel-button"` → sheet "Cancel this shift?" with the advance-cancellation note → `POST /api/shifts/${id}/cancel` `{reason:"advance"}` (`CancelShiftResponse`). Success: `notify.success("Shift cancelled")`, invalidate. Nurses can't choose no-show (API 403).

### 4. Agency shifts (`app/(agency)/agency/shifts/page.tsx`)
- Keep the existing query (`agencyKey(id,"shifts")`). Desktop (≥720px): table with columns Shift, Date/time, Role, Status badge, Claimed by, Actions. Mobile: cards. Status tabs All/Open/Filled/Cancelled with counts.
- `data-testid="agency-post-shift-button"` opens a side panel (desktop) or full sheet (mobile) form: role select (RN/LPN/CNA), date, start, end. Submit `data-testid="agency-post-shift-submit-button"` → `POST /api/shifts` (`CreateShiftRequest`/`CreateShiftResponse`). Validate client-side with `CreateShiftRequest.safeParse` first. Map errors to field messages ("Pick a role", "Enter a date", "Use HH:MM", "Start and end must differ"); show the server 400 text as a fallback in `notify.error`. Success: `notify.success("Shift posted")`.
- Row actions: Open → "Withdraw" (`POST …/withdraw`, confirm). Filled → "Cancel" modal with radios No-show / Cancelled in advance → `POST …/cancel {reason}`. That button is `data-testid="shift-cancel-button"` too (the spec only requires it on the nurse's claimed shift; both are fine).

### 5. Admin (`app/(admin)/admin/*`)
- Dashboard: `useQuery({ queryKey:["admin","shifts"], queryFn: GET /api/shifts, refetchInterval: 15000 })`. Stat tiles open/filled/cancelled (+ "Open next 48 h"). `<table data-testid="admin-dashboard-shift-table">`. Each row has a status cell `<span data-testid="admin-shift-status-badge" class="badge st-{status}">` with icon + label. "Updated Ns ago · refreshes every 15 s". Agency/status filters client-side. Nurse name column shows `claimedBy` id until `GET /api/admin/coverage` exists (P1).
- Audit: `useInfiniteQuery` on `GET /api/audit-logs?limit=50&cursor=` (`AuditLogResponse`), "Load more" while `nextCursor`. `<table data-testid="audit-log-table">` columns: Time (`occurredAt`, local format), Actor (`actorUserId` + role), Action, Entity (`entityType`/`entityId`), Agency, Changes (compact JSON diff). Filters action/entity/date map to the existing query params (`AuditLogQuery`). The agency filter needs QA-005 (add `agencyId` to `AuditLogQuery` in `packages/contracts` + `modules/audit`, admin network-scoped) → `/postman-export`.
- Timesheets: `<table data-testid="timesheet-table">` with a header row and the design's empty state inside the frame (no timesheet model; full timesheets are Extras).

### 6. Stage 7 credentials API (`apps/api/src/modules/credentials/`)
- `POST /api/nurses/me/credentials` (nurse self). Multipart via `@fastify/multipart` (`pnpm --filter api add @fastify/multipart@<pinned>`). Fields `type` (`license`|`tb_screening`|…, per `credentialType` enum in `db/schema/_common.ts`), `expiresOn` (required for license; DB CHECK `credentials_license_needs_expiry`), `screenedOn` for TB (CHECK), `file`. Limits: 10 MB → **413**. Type sniffed from magic bytes (pdf/png/jpeg/heic) → otherwise **415**. Object key `credentials/<uuid>` (no PII). Private bucket (MinIO locally `private-credentials`; R2 in prod). Insert `files` + `credentials` (status `pending`) + audit `credential.uploaded` in one transaction. Response `{ credential: { id, type, status, expiresOn, uploadedAt } }`.
- `GET /api/nurses/me/credentials` → `{ credentials: [...], licenseValid: boolean }`. `licenseValid` = a verified license with `expiresOn >= today` (same rule as the claim eligibility in `modules/shifts` `isEligible`; reuse it, don't duplicate).
- Zod schemas in `packages/contracts/src/index.ts` (`UploadCredentialResponse`, `NurseCredentialsResponse`), rebuild contracts, `/postman-export`.
- Tests: 413, 415, nurse-only (agency/admin 403), key has no email/name, `licenseValid` true for nurse-1 and false for nurse-2. Then close the board task "Upload abuse tests".

### 7. Nurse credentials UI (`app/(nurse)/nurse/credentials/page.tsx`)
- List from `GET /api/nurses/me/credentials` with a status badge (verified/pending/expired). Upload sheet: type select; `<input type="file" accept="application/pdf,image/*" capture="environment" data-testid="credential-upload-input">`; `<input type="date" data-testid="credential-expiry-date-input">` (required when type = license). Submit sends `FormData` — `apiFetch` currently JSON-encodes `body`, so add a `formData` option (no `Content-Type` header, let the browser set the boundary). Success: `notify.success("Credential uploaded")`; 413/415 → `notify.error(server text)`.
- Wire `licenseValid` into the step 2 fallback warning.

### 8. E2E against the real API
- Convert `apps/api/scripts/e2e-flow.mjs` scenarios into Playwright `apps/web/e2e/flows.spec.ts` against a real API + seeded DB (not `mock-api.ts`). Run `pnpm --filter api db:reset` first (local-only guard). Flows: agency posts → nurse-1 claims (banner "Shift claimed") → admin table badge "filled" → nurse-2 claim → banner exact "Credential expired, cannot claim shift" → agency cancels no-show → reopens. Add to CI with a postgres service (board: "Playwright E2E in CI").
- Fix the mock drift: `e2e/mock-api.ts:141-143` returns "Agency not available" where the real cross-agency list returns `Forbidden`.

## Files touched
| File | Change |
|---|---|
| `apps/api/src/modules/auth/routes.ts` | session limiter key (step 0, if option a) |
| `apps/web/src/features/auth/session-flow.ts` (+ test) | restore retries on 429/5xx |
| `apps/web/src/components/shells/{Nurse,Agency,Admin}Shell.tsx` | `<main id="main">`, skip link |
| `apps/web/src/app/globals.css` | nurse scale-up grid/rail, admin <960px top bar, admin max-width, `.skip`, `.sr-only` |
| `apps/web/src/components/ui/{EmptyState,Toaster}.tsx` | h2; persistent live region |
| `apps/web/src/features/nurse/{queries.ts,ShiftCard.tsx,ClaimSheet.tsx,CancelSheet.tsx}` | new |
| `apps/web/src/app/(nurse)/nurse/{shifts,my-shifts,credentials}/page.tsx` | real screens |
| `apps/web/src/features/agency/{PostShiftForm.tsx,ShiftTable.tsx,CancelDialog.tsx}` | new |
| `apps/web/src/app/(agency)/agency/shifts/page.tsx` | table/cards + actions |
| `apps/web/src/features/admin/{CoverageTable.tsx,AuditTable.tsx}` | new |
| `apps/web/src/app/(admin)/admin/{dashboard,audit,timesheets}/page.tsx` | real screens |
| `apps/web/src/lib/api-client.ts` | `formData` body option |
| `packages/contracts/src/index.ts` | `AuditLogQuery.agencyId`; credential schemas |
| `apps/api/src/modules/audit/*` | `agencyId` filter (admin, network-scoped) |
| `apps/api/src/modules/credentials/{routes,service}.ts` (+ tests), `apps/api/src/app.ts` | Stage 7 routes |
| `apps/web/e2e/flows.spec.ts`, `.github/workflows/ci.yml` | real-API E2E |
| `docs/postman/*` | regenerated |

## Migrations / config
- No schema migration for 6b. Stage 7 uses the existing `credentials` + `files` tables (`apps/api/src/db/schema/credentials.ts`, `system.ts`).
- Env (API), names per ARCHITECTURE env table (~L1153) and `.env.example`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PRIVATE_BUCKET=private-credentials`, `S3_ENDPOINT` (local `http://localhost:9000`; MinIO from `docker compose up -d minio minio-init minio-policy`). Prod R2: Victor creates the private bucket + keys in the Cloudflare dashboard and sets them on the Railway `api` service.
- Prod CSP: if uploads go browser → API only (multipart through `/api`), there's no new `connect-src`.

## Verify
1. `docker compose up -d postgres mailpit minio minio-init minio-policy`. `pnpm --filter api db:reset`.
2. Background: `MAIL_TRANSPORT=smtp pnpm --filter api dev`, `pnpm --filter web dev`.
3. Chrome, http://localhost:3000. Per seeded user, re-run the matrix in `docs/qa/WORKFLOW_TEST_RESULTS.md`; every MISSING row must turn PASS:
   - agency-a posts RN 2026-12-01 07:00–19:00 → banner "Shift posted", row `shift-4` open.
   - nurse-1 sees it (`shift-list-item`) → `shift-claim-button` → banner "Shift claimed" → in My shifts → `shift-cancel-button` → reopens; Mailpit http://localhost:8025 has a mail to the agency.
   - nurse-2: warning + list → claim → banner text exactly `Credential expired, cannot claim shift`; shift still open.
   - admin-1: `admin-dashboard-shift-table` badges update within 15 s; `audit-log-table` shows the trail with Load more; `timesheet-table` present.
   - nurse-1 credentials: upload a synthetic PDF (<10 MB) with expiry → pending; an 11 MB file → 413 banner; a .txt renamed .pdf → 415 banner.
4. All 15 IDs present — `grep -rhoE 'data-testid="[a-z-]+"' apps/web/src | sort -u`.
5. Viewport sweep: from `apps/web`, `QA_PASSWORD=<spec password> node scripts/qa-responsive.mjs ../../docs/qa/screenshots/responsive-6b` → no overflow, nurse 2/3 columns at 768/1440, admin not broken at 768.
6. `/verify` GREEN, `pnpm --filter web test:e2e` GREEN, `/postman-export --check` current.
7. `pnpm --filter api db:reset` → shift-1 open before any prod reseed.

## Out of scope
- Credential review queue UI/API (`GET /api/admin/credentials`, review PATCH, signed download links): P1, next plan.
- `GET /api/admin/coverage` (nurse names on the dashboard): P1.
- Full timesheets (clock in/out, approval), facilities, profile editing, avatar, dark-mode toggle.
- License/TB one-click export: escalated (`ESCALATION.md`, founder decision C vs D).
- PostHog: escalated.
- Past-date shift rule: product decision pending, board task.
- Auditing denied writes, the cancel 403→404 oracle, mapping zod 400 texts on the API: roadmap §4 (P1/P2).
