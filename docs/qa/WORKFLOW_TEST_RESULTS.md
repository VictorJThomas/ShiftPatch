# Workflow Test Results — seeded users (local, Chrome)

Run date: 2026-11-07 · Branch `qa/10-full-audit` · Web `http://localhost:3000` (Next dev) → `/api/*` rewrite → API `http://localhost:3001` (tsx watch, `MAIL_TRANSPORT=smtp` → Mailpit :8025) → Docker Postgres `localhost:5432/shiftpatch`.
Reset between runs: `pnpm --filter api db:reset` (local-only guard; drops + migrates + seeds exact spec data).
Credentials: from `apps/api/src/db/seed.ts` / spec (not repeated here).

**Method.** Each scenario is run in the real UI through the Chrome extension. Where the UI does not exist (Stage 6b not built), the row is marked **UI: Missing** with screenshot of the placeholder, and the backend rule is checked **from the logged-in browser tab** (`fetch` via the extension's JS tool, same origin, real rewrite, real refresh cookie) — marked **API (browser)**. An API (browser) pass is never counted as a UI pass.

Legend: PASS · FAIL (defect → [[DEFECT_LOG]]) · MISSING (feature not built) · N/T (not testable with current fixtures; reason given).

## Matrix (expected behaviour)

### Agency A — `agency-a` Sunrise Health Staffing (role agency, owner)
| # | Scenario | Start | Screen | Interaction | Expected request → response | DB effect | Visual feedback | Acceptance |
|---|---|---|---|---|---|---|---|---|
| A1 | Login | logged out, fresh seed | `/login` | type email/password, submit (`login-*` test IDs) | `POST /api/auth/login` 200 `{token,user:{id:"agency-a",role:"agency"}}`; `GET /api/me` 200 | refresh_tokens row; audit `auth.login` | redirect to `/agency/shifts` | identity + role shown, agency band = Sunrise |
| A2 | Session restore | logged in | `/agency/shifts` | reload | `POST /api/auth/refresh` 200 → `GET /api/me` | rotated refresh token | stays on page | no redirect to login |
| A3 | View own shifts | logged in | `/agency/shifts` | — | `GET /api/agencies/agency-a/shifts` 200, shift-1 + shift-2 | — | list of shifts | list rows with status |
| A4 | Open shift detail | A3 | shift row | click | (no route; detail from list) | — | detail panel | per design `Agency-Shifts` |
| A5 | Post shift: validation | A3 | post form (`agency-post-shift-button`) | submit empty/invalid | `POST /api/shifts` 400 `{error}` | none | error shown inline / banner | no shift created |
| A6 | Post shift: success | A3 | post form | RN 2026-12-01 07:00–19:00, submit (`agency-post-shift-submit-button`) | 201 `{id:"shift-4",agencyId:"agency-a",status:"open",claimedBy:null}` | shifts row, audit `shift.created` | `notification-banner` success; row appears | id + state + agency correct |
| A7 | Cross-agency URL | logged in | — | `GET /api/agencies/agency-b/shifts` | 403 `{error}` | — | — | no agency-b data |
| A8 | Forged `X-Agency-Id: agency-b` | logged in | — | `POST /api/shifts` with header agency-b | 403 `{error}` | none | — | no shift for agency-b |
| A9 | Role guard | logged in | `/admin/dashboard`, `/nurse/shifts` | navigate | — | — | redirect to `/agency/shifts` | no foreign shell rendered |
| A10 | Withdraw open shift | A6 | row action | withdraw shift-4 | `POST /api/shifts/shift-4/withdraw` 200 status `cancelled` | audit `shift.withdrawn` | banner | status cancelled |
| A11 | Cancel filled shift | seed | row action (`shift-cancel-button`?) | cancel shift-2 reason no-show | `POST /api/shifts/shift-2/cancel` 200 `status:"open", cancellation:{reason,previousNurseId:"nurse-1"}` | shift_cancellations row, outbox email, audit | banner | shift reopened |
| A12 | Audit visibility | after A6–A11 | (admin-only page) | `GET /api/audit-logs` | 200, only agency-a rows | — | — | no agency-b rows |
| A13 | Logout | logged in | profile | sign out | `POST /api/auth/logout` 204 | refresh revoked | `/login` | reload stays logged out |

### Agency B — `agency-b` Metro Care Partners
Same as A1–A13 mirrored: own list = shift-3 only; cross-agency = agency-a (403); posting creates next id scoped to agency-b; audit shows no agency-a rows; switcher shows only Metro Care.

### Nurse 1 — `nurse-1` Maria Lopez (license valid to 2027-01-01)
| # | Scenario | Expected | Acceptance |
|---|---|---|---|
| N1-1 | Login → `/nurse/shifts`, 4-tab bottom nav at 390px | 200, role nurse | correct identity, bottom nav |
| N1-2 | Session restore (reload) | refresh 200 | stays logged in |
| N1-3 | Marketplace list (`shift-list-item`) + filters (date/role chips) | `GET /api/shifts?matchable=true` contains shift-1 (RN agency-a) and shift-3 | open eligible shifts listed |
| N1-4 | Shift detail + claim (`shift-claim-button`, confirm sheet) | `POST /api/shifts/shift-1/claim` 200 `status:"filled",claimedBy:"nurse-1"` | banner "Shift claimed"; shift leaves marketplace |
| N1-5 | My shifts | `GET /api/nurses/me/shifts` contains shift-1 + shift-2 | claimed shifts visible |
| N1-6 | Cancel claimed shift (`shift-cancel-button`, reason advance) | `POST /api/shifts/shift-1/cancel` 200 `status:"open", cancellation:{reason:"advance",previousNurseId:"nurse-1"}` | shift reopens; agency email in Mailpit; audit row |
| N1-7 | Wrong-role writes | `POST /api/shifts` 403; `GET /api/audit-logs` 403 | rejected |
| N1-8 | Credentials / profile screens | credentials list + upload (`credential-upload-input`, `credential-expiry-date-input`) | — |

### Nurse 2 — `nurse-2` James Cook (license expired 2026-06-01)
| # | Scenario | Expected | Acceptance |
|---|---|---|---|
| N2-1 | Login → `/nurse/shifts` | 200 role nurse | — |
| N2-2 | Credential status + expired warning | expired license visible, warning with link to upload (ARCH §12.4) | — |
| N2-3 | Marketplace fallback | `?matchable=true` → `[]`; fallback lists open shifts from `GET /api/shifts` with claim **enabled** | — |
| N2-4 | Claim attempt | `POST /api/shifts/shift-1/claim` → **403 `{"error":"Credential expired, cannot claim shift"}`** | `notification-banner` shows that exact text; not generic |
| N2-5 | Backend enforcement | shift-1 still `open`, `claimedBy:null` after attempt | — |

### Admin 1 — `admin-1` Alex Kim (network admin of `network-default`)
| # | Scenario | Expected | Acceptance |
|---|---|---|---|
| AD-1 | Login → `/admin/dashboard`, sidebar; reload restores | 200 role admin | — |
| AD-2 | Coverage dashboard (`admin-dashboard-shift-table`, `admin-shift-status-badge`) | `GET /api/shifts` all shifts; counts open/filled/cancelled; 15 s refetch | badges correct, updates after nurse/agency changes |
| AD-3 | Audit log (`audit-log-table`) | `GET /api/audit-logs` 200 both agencies' rows, `nextCursor` paging | actor, action, timestamp visible |
| AD-4 | Timesheets (`timesheet-table`) | (no route) | — |
| AD-5 | Agency lists via admin | `GET /api/agencies/agency-a/shifts` and `agency-b` → 200 (network admin) | — |
| AD-6 | Out-of-network access | seed has one network | N/T with fixtures → covered by `authz`/`scope` tests |

## Results

Environment notes for every run:
- **Chrome window is maximized at 2552×1260.** `resize_window` reports success but has no effect, so browser runs are desktop-only. Mobile widths are covered in [[UI_UX_AUDIT]] (code and CSS review) and need a re-run with an un-maximized window.
- **The extension's network monitor misreports bodiless 204 responses as 503.** Status codes are therefore taken from the app's fetch result or `performance.getEntriesByType('resource')[].responseStatus`.
- **The Grammarly extension** injects `<body>` attributes, causing a React hydration warning in dev. This is not an app issue.

### Agency A — run 1 (QA subagent, tab 2075174951, fresh seed)
| # | Result | Evidence |
|---|---|---|
| Login, wrong password | PASS (a11y gap) | Toast `notification-banner`, inner `role=alert`, text "Invalid email or password". No `aria-invalid` or inline error on the fields (the design shows an inline alert). Screenshot `screenshots/agency-a-login-error-1699.jpg` |
| A1 Login | PASS | login 200 → `/api/me` 200 → `/api/agencies/agency-a/shifts` 200. Lands on `/agency/shifts`, band "Sunrise Health Staffing". `agency-a-login-1699.jpg`, `agency-a-shifts-1699.jpg` |
| A2 Session restore | PASS | refresh 200 → me 200, stays on page |
| A3 Own shift list | **MISSING** (count PASS) | Only "2 shifts for this agency.", no rows, no `shift-list-item` |
| A4 Shift detail | **MISSING** | — |
| A5/A6 Post shift UI | **MISSING** | No `agency-post-shift-button` or `-submit-button` |
| A5 API (browser): validation | PASS | `{}` → 400 `{"error":"Invalid option: expected one of \"RN\"\|\"LPN\"\|\"CNA\""}`. Role XX → 400. `25:00` → 400 `{"error":"Invalid ISO time"}`. Raw zod messages, noted in [[API_ENDPOINT_AUDIT]] |
| A6 API (browser): create | PASS | 201 `shift-4`, agency-a, open, `claimedBy:null`. Audit `shift.created` |
| A7 Cross-agency list | PASS | `GET /api/agencies/agency-b/shifts` → 403 `{"error":"Forbidden"}` |
| A8 Forged `X-Agency-Id: agency-b` | PASS | `POST /api/shifts` → 403 `{"error":"Agency not available"}`. No agency-b shift created |
| A9 Role guard | PASS | `/admin/dashboard` and `/nurse/shifts` → `/agency/shifts` |
| A10 Withdraw UI | **MISSING** | — |
| A10 API (browser) | PASS | shift-4 withdraw → 200 `cancelled`. Audit `shift.withdrawn`. Withdrawing agency-b's shift-3 → 404, shift-3 still open |
| A11 Cancel UI | **MISSING** | No `shift-cancel-button` |
| A11 API (browser) | PASS | shift-2 no-show → 200, open, claimedBy null. `shift_cancellations`: no-show, previous nurse-1. Audit `shift.cancelled`. Bad reason → 400 |
| A12 Audit visibility | PASS (API) / UI N/A for agency | 200 `{items[],nextCursor}`, 5 rows, all agency-a |
| A13 Logout | PASS | Lands on `/login`, reload stays logged out (refresh 401). The 503 seen in the extension is a tool artifact (QA-001) |
| Focus / keyboard | PASS | Visible 2.67px outline, logical order. **No skip link** |
| Touch targets (desktop) | PASS | All ≥44px |
| Responsive 390 | **N/T** | Window can't be resized |

### Agency B — run 1 (QA subagent, fresh seed)
| # | Result | Evidence |
|---|---|---|
| Login (UI, 3 login test IDs) | PASS | `/agency/shifts`, band "Metro Care Partners", count "1 shift for this agency." Screenshot `screenshots/agency-b-shifts-desktop.jpg` |
| Session restore | PASS | refresh 200 → me 200 → `/api/agencies/agency-b/shifts` 200 |
| Role guard (`/admin/dashboard`, `/nurse/shifts`, `/nurse/my-shifts`) | PASS | All redirect to `/agency/shifts` |
| No agency-a leakage (UI text, HTML, localStorage) | PASS | No "Sunrise"/`agency-a` on the page. Only `sp.activeAgencyId=agency-b` in storage, no token stored. (Agency profile page not checked) |
| Stale `sp.activeAgencyId=agency-a` + reload | PASS (silent recovery) | `pickActiveAgency` replaces it with agency-b from `/api/me` before any request. The 403 "agency rejected" toast path can't be reached without a write UI; unit-covered in `api-client.test.ts` |
| Own shift list / post / cancel / withdraw UI | **MISSING** | Stage 6b |
| API (browser): own list | PASS | 200, exactly shift-3, full 9-field shape |
| API (browser): agency-a list | PASS | 403 `{"error":"Forbidden"}` |
| API (browser): create | PASS | 201 `shift-4`, agency-b, open, `claimedBy:null` |
| API (browser): forged `X-Agency-Id: agency-a` | PASS | 403 `{"error":"Agency not available"}` |
| API (browser): withdraw agency-a's shift-1 | PASS | 404 `Shift not found`, shift-1 still open |
| **API (browser): cancel agency-a's filled shift-2** | **PASS** | 403 `Forbidden`, DB still filled by nurse-1. (Inconsistent with withdraw's 404: cancel reveals that the shift exists. See [[API_ENDPOINT_AUDIT]] and the board item "Cancel: authorize before body validation") |
| API (browser): agency claims shift-1 | PASS | 403 |
| API (browser): audit-logs + paging | PASS | 3 rows, all agency-b. `limit=1` cursor chain id 3→2→1 then `nextCursor:null`. Bad cursor/limit → 400 `Invalid query` |
| API (browser): `/api/me` | PASS | Only agency-b membership (owner) |
| API (browser): `?matchable=true` | PASS | 403 (nurse-only) |
| Logout + reload | PASS | browser timing 204, reload stays logged out |
| Observation | Info | Denied cross-tenant attempts write no audit rows (design choice; noted in roadmap) |

### Nurse 1 — run 1 (QA subagent, fresh seed; no reset afterwards so Nurse 2 and Admin see this trail)
| # | Result | Evidence |
|---|---|---|
| N1-1 Login (UI) | PASS | → `/nurse/shifts`. Profile shows Maria Lopez. Screenshots `nurse-1-shifts-desktop.jpg`, `nurse-1-profile-desktop.jpg` |
| N1-1 Bottom nav (4 tabs) | PASS | `<nav aria-label="Main">`, `aria-current` on the active tab, correct URLs |
| N1-2 Session restore | PASS | "Loading your session…" then restored |
| Role guard | PASS | `/agency/shifts`, `/admin/dashboard` → `/nurse/shifts` |
| N1-3 Marketplace UI, filters, detail | **MISSING** | `/nurse/shifts` is an empty state. No `shift-list-item` |
| N1-3 API (browser) | PASS | `GET /api/shifts` returns the 3 seed shifts exactly. `?matchable=true` returns shift-1 + shift-3. **Past-dated shifts are offered** (2026-10-0x < today 2026-11-07); pending product decision, not a defect |
| N1-4 Claim UI | **MISSING** | No `shift-claim-button` |
| N1-4 API (browser) claim | PASS | 200, exactly 9 keys, `status:"filled"`, `claimedBy:"nurse-1"`. Leaves matchable. Re-claim → 409 `Shift is no longer open`. Empty JSON body → no 500 |
| N1-5 My shifts UI | **MISSING** | Placeholder says "No claimed shifts yet" although nurse-1 holds shift-2 (because the page is a placeholder) |
| N1-5 API (browser) | PASS | `GET /api/nurses/me/shifts` contains shift-1 + shift-2 |
| N1-6 Cancel UI | **MISSING** | No `shift-cancel-button` |
| N1-6 API (browser) cancel `advance` | PASS | 200, `status:"open"`, `claimedBy:null`, `cancellation:{reason:"advance",previousNurseId:"nurse-1"}`. Back in matchable. **Mailpit:** "Shift cancelled: RN on 2026-10-02" → admin@sunrisehealth.example about 5 s later. (Agency A's earlier no-show cancel also emailed the nurse: "Shift cancelled: LPN on 2026-10-03" → maria.lopez@example.com) |
| N1-6 Nurse marks own no-show | PASS (by design) | 403. No-show is for the owning agency or admin only (ARCHITECTURE state table) |
| Cancel a shift nurse-1 doesn't hold | PASS | 403 |
| N1-7 Wrong-role writes/reads | PASS | POST shifts, audit-logs, agency list, withdraw → all 403 `Forbidden`. No auth → 401 `Unauthorized` |
| N1-8 Credentials UI | **MISSING** | `/nurse/credentials` placeholder. No `credential-upload-input`/`-expiry-date-input`. No credentials API (`/api/me` has no license info) |
| Logout | PASS | → `/login`, reload stays logged out |
| A11y | FAIL (High) | **No `<main>` landmark**. No skip link. h1 → h3 jump (EmptyState). `/nurse/profile` title is a bare "ShiftPatch" |
| Desktop | Info | Nurse shell is a narrow centered column on a 2552px window; looks like a phone mock-up (see [[UI_UX_AUDIT]] Nurse-Scale-Up) |
| Note | Info | The agent made one unplanned extra claim + cancel on shift-3 (empty-JSON-body check); reverted, leaves 2 extra audit rows + 1 email to agency-b |
| Final state | — | shift-1 filled nurse-1 (re-claimed for the Admin run), shift-2 filled nurse-1, shift-3 open |
