# Remediation Roadmap — from the 2026-11-07 QA run

Inputs: [[WORKFLOW_TEST_RESULTS]] · [[DEFECT_LOG]] · [[FEATURE_COMPLETENESS]] · [[API_ENDPOINT_AUDIT]] · [[UI_UX_AUDIT]].
Priority = impact × urgency ÷ effort. **P0** blocks a mandatory deliverable or the graders' click-through · **P1** wishlist value or high UX/a11y · **P2** polish or later.
Architecture stays as approved. Everything below fits ARCHITECTURE §12/§16.2; nothing needs a rewrite.

**Bottom line.** The backend is mature and correct: all 6 spec routes are exact, tenant isolation held in every cross-agency and cross-role probe, and the expired-credential 403 text is exact. The product isn't presentable yet because **the Stage 6b screens don't exist**: 11 of the 15 required test IDs are missing, and the graders' automated test-ID click-through would fail at the first step after login. That, plus QA-006, is the critical path.

## 1. Workflow blockers
| # | Problem | User | Screen | API/backend | Recommendation | Outcome | Deps | Pri |
|---|---|---|---|---|---|---|---|---|
| 1.1 | Grader click-through or a NAT gets logged out after more than 30 page loads/min/IP (QA-006) | all | every page load | `auth/routes.ts` session limiter; `session-flow.ts restore()` | Key the refresh limit by the refresh-family hash (or raise the IP cap), and retry 429/5xx in `restore()` after `retry-after` instead of going anonymous. Victor decides (it reverses `Decisions.md:94`) | Reliable sessions under shared IPs | none | **P0** |
| 1.2 | No nurse claim/cancel, agency post/cancel or admin coverage UI (all workflows stop at "MISSING") | all | see §2 | none (routes exist) | Build Stage 6b (separate plan: `docs/stage-6b-feature-ui-plan.md`) | Every seeded workflow can be done in the UI | 1.1 | **P0** |

## 2. Missing mandatory features (the 11 test IDs)
| # | Problem | User | Screen (design file) | API | Recommendation | Pri |
|---|---|---|---|---|---|---|
| 2.1 | Nurse marketplace: `shift-list-item`, `shift-claim-button`, claim confirm, success/error `notification-banner` | Nurse | `/nurse/shifts` (Nurse-Shifts, Nurse-Detail-Claim) | `GET /api/shifts?matchable=true`, `POST /api/shifts/:id/claim` ✓ | Cards + confirm sheet. On error: `notify.error(err.message)` (the plumbing keeps the exact server text, see the N2-4 readiness finding) | **P0** |
| 2.2 | Lapsed-license fallback (§12.4): warning + open shifts with claim enabled → 403 banner "Credential expired, cannot claim shift" | Nurse 2 | `/nurse/shifts` (Nurse-License-Lapsed) | Needs a credential-status source (2.6), or the fallback "matchable empty and open shifts exist" | Show the fallback list when matchable is empty; the warning copy needs credential status | **P0** (graders test nurse-2) |
| 2.3 | My shifts + `shift-cancel-button` (reason advance) | Nurse | `/nurse/my-shifts` (Nurse-My-Shifts) | `GET /api/nurses/me/shifts`, `POST …/cancel` ✓ | List + cancel sheet. Remove the misleading "No claimed shifts yet" placeholder | **P0** |
| 2.4 | Agency list rows + `agency-post-shift-button` / `-submit-button` + cancel (no-show/advance) + withdraw | Agency | `/agency/shifts` (Agency-Shifts, -Post-Shift, -Cancel, -Mobile) | `GET /api/agencies/:id/shifts`, `POST /api/shifts`, cancel, withdraw ✓ | Table on desktop, cards on mobile. Side-panel form with inline zod errors (map raw zod messages to field copy) | **P0** |
| 2.5 | Admin `admin-dashboard-shift-table` + `admin-shift-status-badge`, stat tiles, 15 s refetch | Admin | `/admin/dashboard` (Admin-Dashboard) | `GET /api/shifts` ✓ (nurse names need `GET /api/admin/coverage`, P1) | Table + badges (icon + label + tint) + `refetchInterval: 15000` | **P0** |
| 2.6 | `credential-upload-input`, `credential-expiry-date-input` | Nurse | `/nurse/credentials` (Nurse-Credentials) | **Missing:** `POST/GET /api/nurses/me/credentials` (Stage 7: 10 MB → 413, sniffed type → 415, private bucket) | Stage 7 route + upload sheet | **P0** |
| 2.7 | `audit-log-table` with cursor "Load more" | Admin | `/admin/audit` (Admin-Audit) | `GET /api/audit-logs` ✓ | Table, action/entity/date filters. Replaces QA-004 | **P0** |
| 2.8 | `timesheet-table` | Admin | `/admin/timesheets` (Admin-Timesheets) | none (no timesheet model) | Minimal table frame with the design's empty state inside, as ARCHITECTURE scopes it. Full timesheets stay in Extras | **P0** (test ID only) |

## 3. Missing API endpoints
| Endpoint | Purpose | Consumer | Permission | Pri |
|---|---|---|---|---|
| `POST /api/nurses/me/credentials` (multipart: file, type, expiresOn) | Upload a license/TB doc with expiry | Nurse credentials | nurse (self) | **P0** |
| `GET /api/nurses/me/credentials` | Credential status → §12.4 trigger + credentials list | Nurse shifts/credentials | nurse (self) | **P0** |
| `GET /api/admin/coverage` | Shift rows with nurse names + counts (the spec shape can't carry names) | Admin dashboard | network admin | P1 |
| `GET /api/admin/credentials`, `PATCH /api/credentials/:id/review`, `GET /api/credentials/:id/download-url` | Review queue, 5-min signed links | Admin credentials | network admin | P1 |
| `agencyId` filter on `GET /api/audit-logs` (QA-005) | Agency filter on the audit screen | Admin audit | admin (network-scoped) | P1 |
| `GET /api/shifts/:id/details`, agency profile GET/PATCH, facilities, me/profile, avatar, `DELETE /api/shifts/:id` | Architecture extras | detail sheet, profiles | per ARCH §8.4 | P2 |
Full contract sketches: [[API_ENDPOINT_AUDIT]] §4.

## 4. Security
| # | Finding | Recommendation | Pri |
|---|---|---|---|
| 4.1 | QA-006 (availability, not confidentiality) | see 1.1 | **P0** |
| 4.2 | Cancel returns 403 for another tenant's shift, withdraw returns 404: an existence oracle; body validation runs before authorization | Authorize before validating, and return 404 for out-of-scope shifts (board item "Cancel: authorize before body validation") | P1 |
| 4.3 | Denied writes (e.g. nurse-2 claim 403, cross-tenant attempts) aren't audited | Decide: audit `shift.claim_denied` with reason (useful for compliance) | P2 |
| 4.4 | `POST /api/shifts` 400 messages are raw zod strings | Map to stable field messages (also improves UX) | P2 |
| — | Verified OK | Tenant isolation (lists, writes, forged `X-Agency-Id`, audit scope), role matrix, 401 without a token, CSP/XFO/HSTS, refresh Origin check, no tokens in web storage | — |

## 5. Mobile UX (nurse-first)
| # | Problem | Recommendation | Pri |
|---|---|---|---|
| 5.1 | Nurse shell has no `<main>` | Wrap the content in `<main id="main">` (`NurseShell.tsx`) | P1 |
| 5.2 | Toast sits at `top:12px` over the app bar on mobile | Use the design's placement below the bar, or a bottom placement above the tab bar | P2 |
| 5.3 | Shift cards need one-handed claim | Sticky bottom claim button + confirm sheet (§12.3); 44px targets | P0 (in 2.1) |
| 5.4 | Loading/empty/error/offline states | Skeletons with `aria-busy`, retry button on error (Nurse-Shift-States) | P1 |

## 6. Desktop UX
| # | Problem | Recommendation | Pri |
|---|---|---|---|
| 6.1 | Nurse UI is a 480px phone column on desktop | Implement Nurse-Scale-Up: 2 columns ≥700px, 3 columns + 232px rail ≥1000px | P1 |
| 6.2 | Admin shell breaks at 720–888px (sidebar takes the first row) | Collapse to a top bar / icon rail below 960px | P1 |
| 6.3 | Admin content unbounded (2304px at 2552) | `max-width: 1440px` on admin `main` | P2 |
| 6.4 | Agency: no filters or status tabs | Status tabs (All/Open/Filled/Cancelled) per Agency-Shifts | P1 (with 2.4) |

## 7. Visual design
| # | Problem | Recommendation | Pri |
|---|---|---|---|
| 7.1 | Post-login screens are empty states on a beige field | Resolved by §2; keep the brand tokens | P0 (via §2) |
| 7.2 | Font loads 400–800, CSS asks for 550/650/750 | Load the variable axis or match the weights (`layout.tsx:7`) | P2 |
| 7.3 | 39 inline styles, 14 hard-coded colours, 48 raw px font sizes | Move them to tokens/classes as screens are built | P2 |
| 7.4 | Dark tokens unused, no favicon, admin title 32 vs 28px | Favicon P2. Dark mode stays Later | P2 |

## 8. Accessibility
| # | Problem | Recommendation | Pri |
|---|---|---|---|
| 8.1 | No skip link (all shells) | "Skip to content" → `#main` | P1 |
| 8.2 | Success toast announcements unreliable (QA-003) | One persistent visually-hidden `aria-live="polite"` region in `Toaster` | P1 |
| 8.3 | Login error not tied to the fields | `aria-invalid` + `aria-describedby` + inline alert (design) | P1 |
| 8.4 | EmptyState h1 → h3 | Use h2 | P2 |
| 8.5 | Agency switcher announces a listbox but has no arrow keys | Add arrow-key navigation, or use a menu/radio group | P2 |
| 8.6 | "Show password" 36px tall; double reveal control on Edge | 44px min-height; `::-ms-reveal{display:none}` | P2 |
| 8.7 | Generic `<title>` on `/nurse/profile`, `/agency/*` | Add metadata per page | P2 |

## 9. Future enhancements
Past-dated shifts are offered and claimable (seed dates are before today; **product decision pending**, board task) · license type vs shift role on claim (board) · overlapping-shift exclusion · full timesheets · credential review queue · PostHog (escalated) · export Option C/D (ESCALATION.md) · Mailpit/Resend prod config.

## Suggested order
1. **Decide QA-006** (1.1). Small change, and the biggest risk to the graded click-through.
2. **Stage 6b screens** 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.7 → 2.8, with the shell fixes 5.1/6.1/6.2/8.1 done first since every screen inherits them.
3. **Stage 7** 2.6 + `GET /api/nurses/me/credentials` (also makes the 2.2 warning exact).
4. Playwright E2E against the real API for the five seeded workflows (board: "Playwright E2E in CI"), then re-run this QA matrix in Chrome.
5. P1/P2 polish.
