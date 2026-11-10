# Canvas QA, 2026-11-10 (branch feature/16-final-mvp)

Method: production build (`next start -p 3100`) against the real API (`start:local` on 3201), DB reset to seed. Playwright Chromium, one login per role: nurse 390x844 (Maria, James with expired license), agency 1440x900 + 390x844 (Sunrise), admin 1440x900 + 390x844. Screenshots: `docs/qa/screenshots/canvas-2026-11-10/` (35 PNG). Compared against `docs/design/screens/*.dc.html` (25 files) and `DESIGN.md`. Prior items in UI_UX_AUDIT / DEFECT_LOG (QA-001..015) are not repeated unless still open.

Not captured: loading skeleton, API-error and offline states, dark theme, and the nurse claim-confirm step (my script's Claim click was blocked by the open detail sheet; claim itself was exercised on James's expired-license path and via the seeded My shifts). These are covered by the mocked e2e flows, not this pass.

## Canvas screens (25)

| # | Canvas file | Status | Evidence / note |
|---|---|---|---|
| 1 | Main (brand sheet) | OK | logo/tokens match |
| 2 | Login-Desktop | OK, F3 | `login-desktop*.png` |
| 3 | Login-Mobile | OK, F3 | error shown as toast only |
| 4 | Nurse-Shifts | OK | cards, chips, tags match; date chip filter is inside Filters |
| 5 | Nurse-Detail-Claim | Partial, F2 | detail sheet lacks Pay, Facility, Description, Contact |
| 6 | Nurse-License-Lapsed | OK | banner + toast + list still visible, as designed |
| 7 | Nurse-Shift-States | Not captured | covered by e2e |
| 8 | Nurse-My-Shifts | Adaptation, F4 | no confirm sheet (QA-012 by design) |
| 9 | Nurse-Credentials | Partial, F5 | no required-docs checklist |
| 10 | Nurse-Profile | Partial, F6 | fewer rows, wording differs |
| 11 | Nurse-Scale-Up | OK, F9 | rail + 2 cols at 1440 (design: 3 cols >=1000) |
| 12 | Agency-Shifts | OK | table + stat tiles + filters |
| 13 | Agency-Mobile | Adaptation | cards; no tab bar by design (account menu in band) |
| 14 | Agency-Post-Shift | Adaptation | centered dialog instead of side panel; per-field errors |
| 15 | Agency-Cancel | OK | reason radios match |
| 16 | Agency-States | Not captured | covered by e2e |
| 17 | Agency-Switcher | Not verified | seed agency has 1 membership; switcher hidden (expected) |
| 18 | Agency-Profile | Adaptation, F7 | read-only, no edit form / preview |
| 19 | Admin-Dashboard | OK (exceeds) | tiles + per-agency table + live pill |
| 20 | Admin-States | Not captured | stale/dark not reachable |
| 21 | Admin-Credentials | Adaptation | merged into Users > nurse dialog (Verify/Reject) |
| 22 | Admin-Doc-Preview | Missing (escalated) | doc preview is out of scope per ESCALATION.md |
| 23 | Admin-Audit | OK | table, filters, Show all |
| 24 | Admin-Timesheets | OK | empty state inside table frame |
| 25 | Toasts | OK, F8 | success/error styles match |

## Findings (sorted by severity)

No P1 found: every role logs in, lists render, post/cancel/claim dialogs work, and the expired-license path behaves as designed.

| ID | Sev | Class | Screen | Finding | File hint | Fix |
|---|---|---|---|---|---|---|
| F1 | P2 | functional / visual | `/admin/users` | License column shows "—" for both nurses although Maria is Verified and James Expired (same as open QA-010). Looks broken in a demo. | admin users table (`apps/web/src/features/admin/*Users*`) / API users list payload | Return the nurse's license credential status in the list DTO, or fetch credentials and render the status badge. |
| F2 | P2 | missing feature | Nurse shift detail sheet | Canvas shows Pay, Facility address, Description, Agency contact; app shows only Agency, Date, Hours, Role. Probably no such fields in the spec data model. | `features/nurse/Marketplace.tsx` | If data does not exist, accept as adaptation and note it in the brain; otherwise hide nothing. Do not fake data. |
| F3 | P2 | missing feature / a11y | Login (both) | Auth error appears only as a toast (top, overlapping content); canvas has an inline alert above the fields. Toast auto-dismisses for some users before it is read. | `features/auth/login-form.tsx` | Render inline `role="alert"` alert above the fields (keep toast optional). |
| F4 | P3 | adaptation | Nurse My shifts | Cancel is immediate with toast; canvas has a "Cancel this shift?" confirm sheet. Closed by design (QA-012) but a demo viewer may expect the sheet. | `features/nurse/MyShifts.tsx` | Optional: add confirm sheet; keep `shift-cancel-button` on the trigger only if tests allow. |
| F5 | P3 | missing feature | Nurse Credentials | No required-documents checklist (Nursing license, TB, BLS, Vaccination) with rejected-note state; list shows only credentials on file. | `features/nurse/Credentials.tsx` | Acceptable per spec (license/TB export escalated); mention in ESCALATION/brain. |
| F6 | P3 | visual inconsistency | Nurse Profile + tab bar | Badge reads "License valid" (canvas "License verified"); Roles, Email & password, Time zone rows absent; mobile tab bar has 3 tabs, Profile only via avatar (canvas has 4). | `app/(nurse)/nurse/profile/page.tsx`, NurseShell | Rename badge; either add a 4th tab or accept avatar entry. |
| F7 | P3 | missing feature | Agency Profile | Read-only details and agency list; no edit form, logo upload or "How nurses see you" preview. | `app/(agency)/agency/profile/page.tsx` | Accept as adaptation (no API for profile edit). |
| F8 | P3 | visual inconsistency | Mobile toasts | Toast covers the app bar and part of the banner below it (audit #18, still present). | `globals.css` toaster top | `top: calc(60px + 8px)` on the nurse shell. |
| F9 | P3 | responsive | Nurse desktop | 2 columns at 1440 and the grid hugs the left (empty right half). Canvas shows 3 columns at >=1000. | `globals.css` nurse grid | `repeat(auto-fill,minmax(340px,1fr))`. |
| F10 | P3 | responsive | Admin mobile | Coverage-by-agency table clips the Cancelled/Fill rate columns (horizontal scroll with no cue); nav row also clips Timesheets. | admin dashboard table wrapper | Add scroll shadow or stack rows as cards under 480px. |
| F11 | P3 | responsive / a11y | Nurse add credential (390) | The fixed tab bar sits over the form footer in the full-page view; Submit is reachable only after scroll (QA-015, still open). | form footer padding | Add `padding-bottom` equal to the tab bar height plus safe area. |
| F12 | P3 | visual | Agency mobile | Four stat tiles stack full width and push the list three screens down. | agency stats grid | `grid-template-columns: 1fr 1fr` under 480px. |
| F13 | P3 | info | Console | One expected 401 on the first load of each session (refresh without cookie) shows as a console error; 403 on James's claim is the expected expired-license denial. | n/a | None. |

Counts: P1 0, P2 3, P3 10, adaptations are listed in the screen table.

## Orchestrator triage (2026-11-10)
- **F1** (admin users License column "—"): the data is truthful. Seed nurses have no license *type* (spec gives none). Showing credential *status* there needs a contract and API change, so it is deferred (QA-010 stays open, P2). The status is visible on the credential review queue and the nurse detail.
- **F2** (shift detail lacks pay, address, description, contact): adaptation. The spec data model has no such fields, and we don't fake data.
- **F3** (login error is a toast, not inline): kept. The toast is the spec's `notification-banner` (spec §test IDs), asserted by `e2e/auth.spec.ts`. An extra inline alert would double-announce to screen readers.
- **P3s:** deferred, no demo impact. Mobile overlaps (QA-015 tab bar over the credential form footer, toast over the app bar) are the first candidates for a post-submission polish pass.
- **Result:** no P1. No code changes from this pass.
