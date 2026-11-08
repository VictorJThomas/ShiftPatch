# Stage 6b — Independent verification (Agent F, QA)

**Date:** 2026-11-07 · **Build under test:** `feature/6b-feature-ui` @ `8dc8866` (Phase 1 observations); Phase 2 suites re-run after merging `dea0bea` (review fixes: newest-toast-only test ID, toasts inside open dialogs, cookieless refresh = plain 401) · **Verifier:** independent QA agent (did not write the UI).

**Setup (real stack, no mocks):** `pnpm --filter api db:reset` (exact spec seed) → built API `PORT=3201 APP_ORIGIN=http://localhost:3200 pnpm --filter api start:local` → web `API_ORIGIN=http://localhost:3201 pnpm build && next start -p 3200` (production bundle, CSP on) → MinIO via `docker compose up -d minio minio-init minio-policy` (uploads real, not 503) → Playwright headless Chromium driving the UI. One login per role per run (refresh limiter). DB re-seeded after the destructive steps and at the end.

Evidence: screenshots + raw JSON in [`screenshots/stage-6b/`](screenshots/stage-6b/) (`flow-*.png` = matrix steps, `<role>-<route>-<width>.png` = viewport sweep, `*-dialog-*-360.png` = mobile dialogs, `matrix-*.json`, `viewports.json`).

## 1. Five-user matrix (real API)

| User | Step | Result | Evidence |
|---|---|---|---|
| agency-a | Login lands on `/agency/shifts`, h1 "Shifts" | PASS | URL check |
| agency-a | List: shift-1 RN Open + shift-2 LPN Filled (nurse-1), "2 shifts" | PASS | `flow-agency-a-list.png` |
| agency-a | `agency-post-shift-button` → RN 2026-12-01 07:00–19:00 → `agency-post-shift-submit-button` → banner "Shift posted", count 3 | PASS | `flow-agency-a-posted.png` |
| agency-a | Withdraw the new shift (shift-4) → "Shift withdrawn", row Cancelled | PASS | matrix-agency.json |
| agency-a | `shift-cancel-button` on shift-2 opens reason dialog (no-show / advance); Esc closes, focus back on trigger | PASS (see D2) | `flow-agency-a-cancel-dialog.png` |
| agency-a | Cancel shift-2 "Cancelled in advance" → "Shift cancelled", row back to Open (then DB re-seeded) | PASS | matrix-agencycancel.json |
| agency-b | Sees only shift-3 ("1 shift"), no Sunrise/LPN rows | PASS | `flow-agency-b-list.png` |
| agency-b | API: agency-b token on `/api/agencies/agency-a/shifts` → 403 `Forbidden` (own header) / 403 `Agency not available` (foreign header) | PASS | matrix-agency.json |
| nurse-1 | Marketplace: 2 `shift-list-item` (Sunrise RN, Metro RN) | PASS | `flow-nurse-1-marketplace.png` |
| nurse-1 | Details dialog: labelled, Esc closes, focus returns to "Details" | PASS | matrix-nurse.json |
| nurse-1 | `shift-claim-button` on shift-1 (one click) → banner "Shift claimed", card leaves list | PASS | `flow-nurse-1-claimed.png` |
| nurse-1 | My shifts → `shift-cancel-button` (one click) → "Shift cancelled" | PASS | `flow-nurse-1-my-shifts.png` |
| nurse-1 | shift-1 back in the marketplace | PASS | matrix-nurse.json |
| nurse-2 | "Your license has expired." warning + 2 open shifts listed with Claim enabled | PASS | `flow-nurse-2-expired.png` |
| nurse-2 | Claim → `notification-banner` `role=alert` text exactly `Credential expired, cannot claim shift` | PASS | `flow-nurse-2-403.png` |
| nurse-2 | Shift still open (UI + `GET /api/shifts` as admin: shift-1, shift-3 open) | PASS | matrix-nurse.json |
| admin-1 | Badge for shift-1 Open → **Filled 13.9 s** after nurse-1's claim, no reload; back to Open after cancel | PASS | matrix-nurse.json |
| admin-1 | `admin-dashboard-shift-table`: 4 rows, exactly one `admin-shift-status-badge` per row (Open, Filled, Open, Cancelled) | PASS | `flow-admin-dashboard.png` |
| admin-1 | `audit-log-table`: 12 rows; Agency filter (All / Metro / Sunrise) → 2 rows; "Load more" not shown (12 < page size 50, correct) | PASS | `flow-admin-audit.png` |
| admin-1 | `timesheet-table` present (empty state: no completed shifts in seed) | PASS | `flow-admin-timesheets.png` |
| credentials | Upload dialog exposes `credential-upload-input` + `credential-expiry-date-input` (0 in DOM before opening, see D3) | PASS | matrix-nurse.json |
| credentials | 11 MB PDF → **client-side** inline field error "File is larger than 10 MB", no request, no banner (see D4) | PASS | matrix-nurse.json |
| credentials | `.txt` renamed `.pdf` → server 415 → banner `Unsupported file type. Upload a PDF, JPEG, PNG or HEIC file` | PASS | matrix-nurse.json |
| credentials | Valid PDF + expiry 2028-01-01 (390 px) → "Credential uploaded", Pending card | PASS | `flow-credentials-uploaded.png` |

25/25 PASS. Note: `matrix-nurse.json` also holds one FAIL for the valid upload — a harness fault (the previous step's 415 error banner persists until dismissed, by design, and my check matched it). Re-run in isolation (`matrix-cred.json`): PASS.

## 2. Test IDs (static grep + runtime)

| test ID | Element | Where | Verdict |
|---|---|---|---|
| `login-email-input` | `input[type=email]` | login-form.tsx | OK |
| `login-password-input` | `input[type=password]` | login-form.tsx | OK |
| `login-submit-button` | `button[type=submit]` | login-form.tsx | OK |
| `shift-list-item` | `article` card, once per open shift | Marketplace.tsx (nurse only) | OK |
| `shift-claim-button` | `button`, one per card, claims in ONE click | Marketplace.tsx | OK |
| `shift-cancel-button` | nurse: `button`, cancels in ONE click (My shifts) · agency: row `button` that OPENS a reason dialog | MyShifts.tsx, agency-shifts-view.tsx | **Risk, D2** |
| `credential-upload-input` | `input[type=file]` (visually hidden, focusable) | UploadCredentialDialog.tsx | OK, only after opening the dialog (D3) |
| `credential-expiry-date-input` | `input[type=date]` | UploadCredentialDialog.tsx | OK, dialog only; hidden when type = TB screening |
| `agency-post-shift-button` | `button`, opens the form dialog | agency-shifts-view.tsx | OK |
| `agency-post-shift-submit-button` | `button[type=submit]` in the dialog | post-shift-form.tsx | OK |
| `admin-dashboard-shift-table` | `table` | AdminDashboard.tsx | OK |
| `admin-shift-status-badge` | `span.badge`, exactly one per row | AdminDashboard.tsx | OK |
| `audit-log-table` | `table` | AuditLog.tsx | OK |
| `timesheet-table` | `table` | Timesheets.tsx | OK |
| `notification-banner` | banner `div`; same ID for success and error, errors carry an inner `role=alert` | NotificationBanner.tsx | OK |

All 15 present; no ID is duplicated per item (agency table vs cards are rendered conditionally, not both). Extra IDs: `active-agency-name`, `agency-shift-count` (harmless).

## 3. Viewports (real app, every route × role, 360/390/768/1440/1920)

Metric: `document.documentElement.scrollWidth - innerWidth` (0 = no horizontal page overflow). Screenshots `<role>-<route>-<w>.png`.

| Route | 360 | 390 | 768 | 1440 | 1920 | Navigation |
|---|---|---|---|---|---|---|
| /login | 0 | 0 | 0 | 0 | 0 | — |
| /nurse/shifts, my-shifts, credentials, profile | 0 | 0 | 0 | 0 | 0 | bottom tabs <1000 px, rail ≥1000 px |
| /agency/shifts, /agency/profile | 0 | 0 | 0 | 0 | 0 | bottom tabs ≤390, header nav ≥768 |
| /admin/dashboard | **+415** | **+385** | **+7** | 0 | 0 | top bar <1000 px, side rail ≥1000 px — **D1** |
| /admin/audit, /admin/timesheets | 0 | 0 | 0 | 0 | 0 | same |

Nurse grid columns observed: 1 (360/390), 2 (768), 2 at 1440/1920 with only 2 open shifts in the seed; the CSS (`globals.css` `.card-grid` 3 columns ≥1000 px) is verified with 3+ cards in the mocked suite (`testids.spec.ts`). Mobile dialogs at 360 px (post shift, cancel reason, shift details, credential upload): full-width bottom sheets, all buttons inside the 800 px viewport, native modal `<dialog>`, labelled, focus inside, Esc closes and returns focus to the opener (`*-dialog-*-360.png`).

## 4. Accessibility (manual; `@axe-core/playwright` is not a dependency, none added)

- Exactly one `<main>` on every page. Skip link "Skip to content" (`#main`) is the first Tab stop in all 3 signed-in shells, visible on focus, Enter moves focus to `main#main`. /login has no skip link (single form, no repeated navigation; acceptable).
- Keyboard: marketplace Tab order = nav → filter chips → Claim / Details per card, all with visible focus ring. Every dialog Esc-closes and returns focus to its trigger.
- Dialogs: native `<dialog>` + `aria-labelledby` → title ("Post a shift", "Cancel this filled shift?", "Upload credential", agency name).
- Toasts: one always-mounted `role=status aria-live=polite` region on every page; success text goes there; error banners carry `role=alert` (verified on the 403 and 415).
- Tables: all 5 tables have `<th scope=col>` headers and a caption. 0 unlabelled inputs/selects on any page at any width.

## 5. Defects (severity-sorted)

1. **D1 — High — Admin dashboard overflows the page horizontally on mobile/tablet.** Repro: admin-1, viewport 390×844 (or 360, 768), `/admin/dashboard`. Expected: no page-level horizontal scroll (table scrolls inside its card). Actual: `scrollWidth` 775 at 390 px (+385), +415 at 360, +7 at 768; white band to the right (`admin-dashboard-390.png`). Root cause (probed): `<span class="sr">Unclaimed</span>` in the Nurse column is `position:absolute`; its containing block is outside `.scrollx` (not positioned), so it escapes the scroll container. Suspected files: `apps/web/src/features/admin/AdminDashboard.tsx` (Nurse cell, ~L291) / `apps/web/src/app/tokens.css:201` (`.scrollx` needs `position:relative`, which also fixes any other table).
2. **D2 — Medium (grading risk) — agency `shift-cancel-button` does not perform the cancel.** Repro: agency-a → click `shift-cancel-button` on shift-2. Expected (spec: "on the element that performs the action"): one click cancels, or the element that cancels carries the ID. Actual: opens a reason dialog; the confirming "Cancel shift" submit has no test ID, so a grader script `click(shift-cancel-button) → expect(notification-banner)` that happens to log in as an agency waits forever. The nurse path (one click) is correct. Options: (a) remove the ID from the agency row (the spec's "cancel a claimed shift" reads as the nurse action), or (b) put it on the dialog's submit instead and preselect "advance". Do NOT put it on both (two matches when the dialog is open = strict-mode violation). File: `apps/web/src/features/agency/agency-shifts-view.tsx:256`, `shift-dialogs.tsx`.
3. **D3 — Medium (grading risk) — credential inputs exist only after opening the Upload dialog.** Repro: nurse-1 → `/nurse/credentials` → `getByTestId('credential-upload-input')` → 0 matches until "Upload" is clicked; `credential-expiry-date-input` also unmounts when type = TB screening. Expected: a grader that navigates to the credentials page and fills the inputs directly finds them. Suggest an inline upload form on the page (dialog optional) or an always-mounted form. File: `apps/web/src/features/nurse/Credentials.tsx`, `UploadCredentialDialog.tsx`.
4. **D4 — Low — 413 text never reaches the banner from the UI.** 11 MB file is stopped client-side with an inline field error (same text, `File is larger than 10 MB`), not a `notification-banner`. Fine UX; only noting that the server 413 path is untestable through the UI. 415 works end to end (the type check passes for a `.pdf` name, the server sniffs bytes).
5. **D5 — Low — console error on every cold load.** "Failed to load resource: 401" from the session-restore `POST /api/auth/refresh` with no cookie (login page and first signed-in load). Expected behaviour, but graders reading the console see a red error. Possible fix: answer 204 / `{ token: null }` for "no cookie", or skip the call when the `sp_role` cookie is absent. File: `apps/web/src/lib/api-client.ts` / API auth route.
6. **D6 — Low — admin table shift ids wrap** ("shift-" / "1") at ≤768 px (`admin-dashboard-768.png`); `white-space:nowrap` on `.adm-id`. File: `apps/web/src/app/(admin)/admin.css`.
7. **D7 — Low (test drift, fixed in this branch's e2e) — mocked API diverged from the real one.** `mock-api.ts` answered "Agency not available" for a path/agency mismatch where the API answers `Forbidden`, and 404 for `/api/shifts`, `/api/nurses/me/*`, `/api/audit-logs`. Fixed in Phase 2 (`apps/web/e2e/**` only).

## 6. Re-check on `dea0bea`

`dea0bea` does not touch `.scrollx`, the admin table or the credential/agency-cancel markup, so D1-D3 and D6 stand as observed on `8dc8866`. D5: a cookieless refresh is still a 401 (now unthrottled), so the console error remains. The real-API flows below pass on `dea0bea`.

## 7. Automated suites (Phase 2, `apps/web/e2e/**`)

- `mock-api.ts` now serves state built from the spec seed (3 shifts, nurse-1 valid / nurse-2 expired license, audit entries with cursor paging) for `GET /api/shifts` (+`?matchable=true`), `POST /api/shifts`, claim / cancel / withdraw, `GET /api/nurses/me/shifts`, `GET|POST /api/nurses/me/credentials`, `GET /api/audit-logs`, with the API's exact error texts. Drift fixed: own header + foreign agency path = 403 `Forbidden`; a foreign/stale `X-Agency-Id` = 403 `Agency not available` (as `loadActor`).
- Drift fixes in existing specs (no assertion weakened, nothing skipped): "Sign out" scoped to `#main` (profile row vs rail icon); agency counts follow the seed (agency-a 2, agency-b 1); "concurrent 401s share ONE refresh" now produces real concurrency (the agency Refresh button is disabled while fetching, so the old double click was sequential) via the nurse marketplace's 3 parallel queries with a token that expires after `/api/me`.
- New `testids.spec.ts` (9 tests): all 15 IDs by role and element type, success banner + polite live region on claim, exact 403 text as `role=alert`, credential inputs (file/date) + upload, post-shift button/submit, admin table with one badge per row, audit "Load more" (60 entries → 50 + 10) and agency filter, nurse grid 1/2/3 columns at 390/768/1440 without page overflow.
- New `flows.spec.ts` (6 tests, real API, opt-in `E2E_REAL_API=1`, resets the DB before and after): agency-a posts → nurse-1 claims → admin badge Filled (≈14 s) → nurse-2 exact 403, shift stays open → nurse-1 cancels → shift reopens, admin badge Open.
- Results: mocked `pnpm --filter web test:e2e` **44 passed, 6 skipped** (the opt-in flows); real `E2E_REAL_API=1 API_ORIGIN=http://localhost:3201 pnpm --filter web test:e2e flows` **6 passed**.

## 8. Not verified

- Screen readers (NVDA/VoiceOver) — announcements checked structurally only.
- Real 413 from the API through the UI (client check intercepts; see D4).
- "Load more" with real data (seed has 12 audit rows < 50); covered by the mocked suite.
- Production deploy (Vercel/Railway) — local stack only.
