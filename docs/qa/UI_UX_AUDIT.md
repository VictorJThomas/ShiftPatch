# ShiftPatch web: static UI/UX + accessibility audit

Scope: `apps/web/src/**` on branch `qa/10-full-audit` (read-only), checked against `docs/design/DESIGN.md`, `docs/design/tokens.css`, `docs/design/screens/*.dc.html` (25 files), and `docs/ARCHITECTURE.md` §12 (lines 1022-1079).
Checklists used: `.claude/skills/accessibility/SKILL.md` (WCAG 2.2 AA, including 2.4.11, 2.5.8 and 3.3.7/3.3.8) and `.claude/skills/frontend-ui-engineering/SKILL.md`. `~/.claude/skills/web-design-guidelines/SKILL.md` has no embedded rules. It only tells the reader to WebFetch `vercel-labs/web-interface-guidelines/command.md`, and this audit did not fetch it (static, offline review). Those rules are applied from known content: focus-visible, `aria-live`, `prefers-reduced-motion`, titles, tabular numbers, `color-scheme`, safe areas, touch targets and autofocus.
Method: code reading only. No browser was run. Contrast ratios were computed with the WCAG relative-luminance formula (script `cr.js` in the same scratchpad).

---

## 0. Headline

- The **shells, login, toast system and agency switcher** are solid and close to the design. They are token-driven, use real buttons and links, `aria-current`, labelled icon buttons, a visible 3px focus ring, and status shown as icon + text.
- **Every feature screen is a placeholder** (an EmptyState). 20 of the 25 design artboards have no implementation, and 11 of the 15 required `data-testid`s are missing (the Stage 6b gap, also stated in `brain/Status.md:10`).
- The biggest structural issues outside 6b:
  - The nurse area has **no `<main>` landmark**.
  - The nurse layout is a fixed 480px column on every screen size, but the design (`Nurse-Scale-Up`) specifies a fluid 1/2/3-column layout with a side rail.
  - The admin shell **breaks between 720 and 888px**.
  - There are no skip links, no error or 404 pages, and no favicon.
  - The toast live region and timer have defects.
  - Dark mode is defined in tokens but can never be turned on.

---

## 1. Screen inventory

| Route | Role | Purpose | Main actions | Data deps / API | Status | Design file(s) | Gap vs design |
|---|---|---|---|---|---|---|---|
| `/` (`app/page.tsx`) | any | Redirect to the role's home or to /login | none | session store | Real (redirect only) | none | Plain "Loading…" text, no brand. |
| `/login` (`app/(auth)/login/page.tsx`, `features/auth/login-form.tsx`) | public | Sign in | Email/password, Show/Hide, Sign in | `login()` -> `POST /api/auth/login`; session bootstrap | **Real** | Login-Desktop, Login-Mobile | The design shows an **inline error alert** above the fields ("Invalid email or password / Check your details…"). The implementation shows the error only as a toast (`login-form.tsx:43`). "Forgot password?" link is missing. Subtitle copy differs ("One login for nurses, agencies and hospital admins." vs `login-form.tsx:53`). |
| `/nurse/shifts` | nurse | Matchable open shifts | Claim, Details, filters | none yet (should be `GET /api/shifts?matchable=true` + credentials fallback, §12.4) | **Placeholder** (EmptyState) | Nurse-Shifts, Nurse-Detail-Claim, Nurse-License-Lapsed, Nurse-Shift-States, Nurse-Scale-Up | No cards, filter chips, sheet, claim flow, lapsed-license banner, or loading/error/offline states. Missing `shift-list-item` and `shift-claim-button`. |
| `/nurse/my-shifts` | nurse | Claimed shifts | Cancel, Details | none | **Placeholder** | Nurse-My-Shifts | No list, cancel sheet or `shift-cancel-button`. |
| `/nurse/credentials` | nurse | Credentials list + upload | Upload, set expiry | none | **Placeholder** | Nurse-Credentials | No list or upload form. Missing `credential-upload-input` and `credential-expiry-date-input` (Stage 7). |
| `/nurse/profile` | nurse | Identity + sign out | Sign out | session store | **Partial** | Nurse-Profile | Has avatar, name, email and Sign out. Missing "License verified" badge, Roles, "Credentials 3 of 4 valid", Email & password, Time zone rows. No page title (client page with no metadata). |
| `/agency/shifts` | agency | Agency's shift list | Refresh (real); design adds Post shift, filters, Withdraw, Cancel | `GET /api/agencies/:id/shifts` (TanStack, agency-scoped key) | **Placeholder with real fetch** (shows only a count, `page.tsx:46`) | Agency-Shifts, Agency-Mobile, Agency-States, Agency-Post-Shift, Agency-Cancel | No table or cards, status filters, post panel, cancel/withdraw dialogs or success toast. Missing `shift-list-item`, `shift-cancel-button`, `agency-post-shift-button` and `agency-post-shift-submit-button`. Error state has no retry inside it. |
| `/agency/profile` | agency | Agency profile | Sign out (placeholder) | session store | **Placeholder** | Agency-Profile | Design has a logo upload, name/email/phone/address form, Save, and a "How nurses see you" preview. |
| (agency shell) `AgencyShell.tsx` | agency | Header nav, Active-agency band, switcher, mobile tab bar | Switch agency, nav, Sign out | session store | **Real** | Agency-Switcher, Agency-Mobile (shell part) | Close to the design. Band colours are hardcoded (`lib/format.ts:9`). |
| `/admin/dashboard` | admin | Coverage | design: filters, stat tiles, shift table, 15 s refetch | none | **Placeholder** | Admin-Dashboard, Admin-States | No stat tiles, filters, live pill, table or dark/error states. Missing `admin-dashboard-shift-table` and `admin-shift-status-badge`. |
| `/admin/audit` | admin | Audit log | design: filters, table, pagination | none (API exists: `GET /api/audit-logs`) | **Placeholder** | Admin-Audit | No table or `audit-log-table`. |
| `/admin/timesheets` | admin | Timesheets | none | none | **Placeholder** (close: the design itself is an empty state) | Admin-Timesheets | Missing the `timesheet-table` wrapper. The design shows an empty state *inside* the table frame. |
| (no route) | admin | Credential review queue | Approve/Reject | n/a | **Not built, no nav entry** | Admin-Credentials, Admin-Doc-Preview | The design sidebar has "Credentials (3)" (`Admin-Dashboard.dc.html`). `AdminShell.tsx:12-16` omits it. This may be intentional: the document preview touches the escalated docs. Confirm against `ESCALATION.md`. |
| Global toasts `Toaster.tsx` / `NotificationBanner.tsx` | all | Success/error feedback | Dismiss | toasts store | **Real** | Toasts | Matches the design (icon, title, message, 5 s timer bar, role status/alert). Mobile placement is `top:12px` (`globals.css:18`), which covers the app bar; the design says "below the app bar". The dark variant is not reachable. |

## 2. Design screens with no implementation (the Stage 6b gap)

| Design file | What it shows | Implementation |
|---|---|---|
| Nurse-Shifts | Available shifts: filter chips (Oct 2-4, All roles, RN, LPN), shift cards (agency, role pill, `Fri, Oct 2 · 19:00 → Sat 07:00`, Overnight · 12 h tag, Open badge, Claim shift + Details) | none |
| Nurse-Detail-Claim | Detail bottom sheet ($48/hour, address, contact) -> "Claim this shift?" confirm sheet -> claimed | none |
| Nurse-License-Lapsed | Error banner "Credential expired, cannot claim shift", inline lapsed-license warning, list still visible with Claim enabled (§12.4 fallback) | none |
| Nurse-Shift-States | Loading skeleton cards, empty "No open shifts match" + Clear filters, error "Couldn't load shifts", offline "Can't reach ShiftPatch" | none |
| Nurse-My-Shifts | Claimed list with Cancel shift / Details; "Cancel this shift?" sheet with advance-cancellation note | none |
| Nurse-Credentials | Required docs checklist (Nursing license, TB, BLS, Vaccination), upload sheet with type, expiry and progress | none (Stage 7) |
| Nurse-Profile | Profile card + License verified badge + settings list | partial (see §1) |
| Nurse-Scale-Up | **Fluid** nurse layout: 1 col + bottom tabs below 700px, 2 cols at ≥700px, 3 cols + 232px left rail at ≥1000px | **contradicted**: the implementation is a fixed 480px column (`globals.css:41`) |
| Agency-Shifts | Desktop shifts table, status filter tabs (All·2 / Open·1 / Filled·1 / Cancelled·0 / Completed·0), Withdraw / Cancel per row, Post shift CTA | count only |
| Agency-Mobile | Cards version of the list + 2-tab bar | shell only |
| Agency-Post-Shift | Side panel form with a validation summary ("Fix 3 things to post this shift") | none |
| Agency-Cancel | "Cancel this filled shift?" modal with reason radio (No-show / Cancelled in advance), Keep / Cancel shift | none |
| Agency-States | Empty, error ("Couldn't load shifts / We'll keep trying"), success toast "Shift posted", Withdraw confirm | partial (generic empty/error EmptyState) |
| Agency-Profile | Profile form + live preview | placeholder |
| Admin-Dashboard | 4 stat tiles (Open/Filled/Cancelled/Open next 48 h), filters (Agency, Status, Dates), shift table with status badges, "Updated 10 s ago · refreshes every 15 s" | placeholder |
| Admin-States | Loading, "Live updates paused" stale-data error with Retry now, **dark theme** | none |
| Admin-Credentials | Credential review queue with Approve / Reject (with note) | no route |
| Admin-Doc-Preview | Secure document preview with a watermark/timestamp and "Reject with note…" | no route (export is escalated; check whether preview is) |
| Admin-Audit | Audit table with actor/action/entity filters, Clear | placeholder |
| Admin-Timesheets | Empty table state | placeholder (close) |

Implemented in reasonable fidelity: Login-Desktop, Login-Mobile (minus the inline error), Toasts, Agency-Switcher, and Main (brand sheet: logo and tokens).

Test IDs present (`grep data-testid`): `login-email-input`, `login-password-input`, `login-submit-button`, `notification-banner` (4 of 15), plus extra `active-agency-name` and `agency-shift-count`.

---

## 3. Design-system consistency

**Tokens:** `apps/web/src/app/tokens.css` matches `docs/design/tokens.css` value for value. It is re-scoped from `.sp` to `:root`. Good.

**Inline styles:** 39 `style={{…}}` in 11 files:

| File | Count |
|---|---|
| AdminShell | 7 |
| nurse/profile | 6 |
| Logo | 5 |
| login page | 4 |
| AgencyShell | 4 |
| agency-switcher | 3 |
| agency/shifts | 3 |
| admin/dashboard | 2 |
| login-form | 2 |
| NotificationBanner | 2 |
| agency/profile | 1 |

Most of them are layout one-offs that should be classes. Examples:
- `AdminShell.tsx:26,29,33,44,48,49,50` (padding, margin, border-top `1px solid var(--c-line)`, `fontSize:14`, `12.5`)
- `nurse/profile/page.tsx:15,16,20,21,22` (`padding:20`, `fontSize:20`, `letterSpacing:"-.01em"`)
- `admin/dashboard/page.tsx:10` overrides `.page-h` to `fontSize:32`. Other admin pages use 28 (`page-h`, `globals.css:91`), so admin H1 size is inconsistent across pages.
- `login-form.tsx:52` hardcodes `marginBottom:22`, which is off the 4px spacing scale.
- `login-form.tsx:112` hardcodes `minHeight:52, fontSize:16`. This is the documented "block 52px" CTA, but no `.btn-lg` class exists, so it is inlined.

**Hardcoded colours outside tokens (14):**
- `globals.css:55,57,61,63,69`: `#fff`, plus `rgba(255,255,255,.14/.24)` on lines 61-62.
- `AgencyShell.tsx:24`: `"#44514E"`, which is the literal value of `--c-ink-2`.
- `Logo.tsx:8,9,10,20,21`: `#fff` and `#0E5A55`, which is the literal brand colour. In dark mode the inverse logo would keep the light brand colour.
- `lib/format.ts:9`: 5 agency band colours. These are design-sourced, but they are not tokens and have no dark variants.

**Typography:** the `--t-*` scale (12/14/16/18/22/28/36/48) is defined but used **once** (`globals.css:6`, body). There are 38 raw `font-size:Npx` declarations in CSS and 10 `fontSize` values in TSX. Off-scale sizes in use: 12.5, 13, 15, 17, 19, 20, 24, 32, 40, 44. Some come from the design system itself (badge 13, button 15), so this is mostly drift.

**Font weights:** the CSS uses 550/650/750 throughout (`.btn` 650, `.page-h` 750, `.li` 550). `layout.tsx:7` loads only `["400","500","600","700","800"]`, so the browser rounds them: 650 -> 700, 750 -> 800, and 550 -> 600 (font-matching rules). Every button and heading renders heavier than designed. Schibsted Grotesk is a variable font, so dropping `weight` (load the variable axis) fixes this and is usually smaller.

**Spacing:** the `--s-*` tokens are used 11 times in tokens.css and once in globals.css. Shell CSS uses raw px: 32, 40, 64, 14, 16, 20, 24 (most are on the 4px scale; 14 and 22 are not).

**Radii:** tokens are used for components. Raw radii are `12px` ×3 and `14px` ×1 (`globals.css:57,66,69,76`). `14px` is off-scale.

**Dark mode:** `:root[data-theme="dark"]` exists (`tokens.css:26-40`), but **nothing sets `data-theme`**. There is no `prefers-color-scheme` media query and no `color-scheme` property, so dark mode is unreachable. The design shows dark for admin and toasts. Hardcoded `#fff` and agency colours would also need dark handling.

**Iconography:** a single consistent set. `Icon.tsx` uses CSS masks with `aria-hidden` by default and a 20/16/24 px sizing API. Good. One risk: in Windows forced-colors mode, `background-color:currentColor` masks get repainted, and icon-only buttons (Sign out, Dismiss) may lose their glyph. Add `@media (forced-colors:active){.ic{forced-color-adjust:none;background-color:CanvasText}}` (or `ButtonText` inside buttons).

**Component reuse:** EmptyState, Icon, Logo and NotificationBanner are shared well. Missing primitives that 6b will need, so build them now to avoid more inline styles:
- Button-lg
- PageHeader
- StatusBadge (with the icon map)
- Sheet/Dialog
- Table wrapper
- Skeleton
- Field (label + input + error wiring, generalised from `login-form.tsx`)

**Other:** no favicon or app icon (`apps/web/public` does not exist, and there is no `app/icon.svg`), although DESIGN.md "Brand" specifies an SVG favicon.

---

## 4. Responsive review

Breakpoints in use:
- 720 (`max-width:719px`): agency and admin
- 768 (`min-width:768px`): toaster
- 960 (`min-width:960px`): login split
- nurse shell `max-width:480px`
- the design's own 700/1000 for the nurse scale-up

**Note:** four different breakpoint systems, none tokenised.

| Width | Login | Nurse | Agency | Admin |
|---|---|---|---|---|
| 360 | OK: form 312px wide, brand on top, aside hidden | OK: 4 tabs × 90px. App bar sticky, tab bar fixed, body padding-bottom 104px clears the 72px bar. No `env(safe-area-inset-bottom)` on `.tabbar` (`tokens.css:176`, `globals.css:44`), so in iOS standalone/PWA the home indicator overlaps the labels. | OK: header hidden, band stacks, switcher full width, 2-tab bar. Sign-out is reachable only from Profile. User identity is not shown. | **Weak:** the sidebar becomes a full-width block above content (`globals.css:89`): logo, tag, 3 × 44px nav rows and the user row take about 300px before the H1 on every page. No collapse or hamburger. |
| 390 | OK | OK (design target) | OK | Same as 360 |
| 768 | OK: aside still hidden until 960 | 480px column centred, 144px empty beige gutters each side, fixed tab bar 480 wide. The design wants 2 columns from 700px. | Header visible. Logo + 2 nav links + full email + sign-out in 704px. `.ag-user` has no `min-width:0` or ellipsis (`globals.css:54`), so a long email squeezes the nav. | **Bug:** `.adm` is `flex-wrap:wrap` with side `0 0 248px` and main `flex:999 1 640px` (`globals.css:86-88`). Between **720 and 887px** the main does not fit beside the sidebar. It wraps under it, leaving a 248px sidebar alone on the first row with blank space to its right and a dangling `border-right`. The mobile reset only applies below 720. |
| 1440 | OK: split 50/50 | 480px phone column in a 1440 canvas: ~67% of the width is empty, the tab bar floats at the bottom centre, and there is no logo or brand. This reads as "mobile site on desktop", not as the designed rail layout. | Good: content capped at 1200px and centred (`globals.css:50,70`). | Main is fluid with no max-width (`globals.css:88`). Fine for tables at 1440. |
| 1920 | Aside text block `maxWidth:30ch` is fine. The form column centres in ~960px: OK. | Same as 1440, worse (75% empty) | 1200 cap, 360px margins each side. Acceptable and consistent. | Main is about 1630px wide. Future tables will stretch, row scanning gets hard, and stat tiles become very wide. Recommend `max-width:~1440px` on `.adm-main` content, or a centred inner wrapper. |

**Nurse 480px column on desktop.** For an MVP whose nurse persona is phone-first, the narrow column is defensible. But it conflicts with the approved `Nurse-Scale-Up` artboard, and graders on a desktop browser will see it first. Recommendation: implement the scale-up as designed (the grid is about 15 lines of CSS) and move the tab bar to a left rail at ≥1000px. At minimum, give desktop a sunken page background with the 480px column as a raised surface plus a header logo, so it reads as intentional.

**Navigation summary:**
- Nurse: bottom tab bar only, with `aria-current`. Good.
- Agency: header nav at ≥720 and tab bar below 720. Both are `<nav aria-label="Agency">`; only one is visible at a time, so that is fine.
- Admin: sidebar with `aria-current`. Good, apart from the 720-888 bug.

---

## 5. Accessibility review

**Language and titles:**
- `lang="en"` is set (`layout.tsx:18`).
- The title template is `%s · ShiftPatch` (`layout.tsx:10`).
- **Missing per-page titles** on the three client pages, which cannot export `metadata`: `/nurse/profile`, `/agency/shifts` and `/agency/profile`. They all show the bare "ShiftPatch". This hurts tab and history disambiguation, and Next's route announcer falls back to the h1.
- Fix: a server `page.tsx` that exports metadata and renders a client component, or a `layout.tsx` per segment.

**Landmarks:**

| Area | Landmarks | Problem |
|---|---|---|
| Nurse | `NurseShell.tsx:21`: the children render `<header class="appbar">` + `<div class="body">` | **No `<main>`**. The SR "main" landmark jump fails on all 4 nurse pages. |
| Agency | header (banner), `section aria-label="Active agency"` (region), main, nav | Good |
| Admin | aside > nav, main | Good |
| Login | aside (complementary), main | Good |

**Skip link:** none in any shell. Admin has about 6 tab stops (sidebar nav + Sign out) and agency 3-4 (header + switcher) before main. Add a visually-hidden-until-focus "Skip to content" link targeting `#main` in AgencyShell and AdminShell (2.4.1 Bypass Blocks).

**Heading hierarchy:**
- `EmptyState.tsx:10` renders `<h3>` directly after the page `<h1>` on 8 pages (h1 -> h3 skips h2). Make the level a prop, or use `h2` by default.
- Login: `<h2>` in the aside (`login/page.tsx:16`) comes before the `<h1>Sign in</h1>` in DOM order at ≥960. Make the marketing line a `<p>` with styling.
- Admin and agency shells: no heading for the nav sections. Acceptable.

**Login form (`login-form.tsx`):**
- Real `<label htmlFor>` (57-58, 82-83).
- `aria-invalid` and `aria-describedby` are set conditionally and point to existing ids (68-69, 92-93).
- Error text has an icon and is not colour-only.
- `autoComplete="username"` and `"current-password"` are correct, which satisfies 3.3.8 (paste is allowed).
- react-hook-form focuses the first invalid field by default.

Issues:
1. Server and auth errors (401/429) appear only in a toast. The design puts them inline, at the top of the form. A toast that auto-dismisses or sits away from the form is easy to miss. Show an inline `.alert.al-err` with `role="alert"` inside the form and keep the toast optional.
2. The "Show" toggle uses `btn-sm` (36px, `tokens.css:115`). That passes WCAG 2.5.8 (24px) but breaks the project's own "touch targets ≥44px" rule (DESIGN.md).
3. The toggle uses **both** `aria-pressed` and a changing label (Show/Hide). Pick one: keep the label "Show password" with `aria-pressed`, or switch the text without `aria-pressed`.
4. `noValidate` combined with `type="email"` is fine.
5. The submit button becomes `disabled` while busy. Focus can drop to `<body>` in some browsers, so prefer `aria-disabled` and guard the submit.

**Focus visibility:**
- Global `:focus-visible{outline:3px solid var(--c-focus);outline-offset:2px}` (`tokens.css:45`).
- Inputs move the ring to the wrapper (`globals.css:8-9`).
- The band button overrides to white (`globals.css:63`).
- Contrast: focus vs bg is 5.71:1; vs the white band it is 5.97-8.81:1. Good.
- 2.4.11 (Focus Not Obscured): the sticky nurse app bar and fixed tab bars can cover focused list rows when tabbing. Add `scroll-padding-top:60px; scroll-padding-bottom:88px` on `html` for nurse and agency-mobile.

**Touch targets (CSS):**
- `.btn` / `.iconbtn` / `.chip` / `.navi` / `.tab`: 44px (`--tap`)
- `.inp`: 48px
- `.li`: 56px
- `.ag-opt`: 64px
- Exceptions: `.btn-sm` is 36px (Show password; the Switch pill is `aria-hidden`). Everything else passes.

**Live regions (Toaster / NotificationBanner):**
- The roles are correct per kind (`NotificationBanner.tsx:34`).
- (a) The `.toaster` container is **unmounted when empty** (`Toaster.tsx:10`). Each toast is a freshly inserted node that already has `role="status"` and content. NVDA and JAWS often do not announce a polite region inserted already populated. `role="alert"` is usually announced. Keep a permanent, empty `aria-live="polite"` container mounted, with an `aria-live="assertive"` one for errors, and inject the content into them.
- (b) **Timer bug:** `Toaster.tsx:14` passes an inline `onDismiss={() => dismiss(t.id)}`. Each store change re-renders it with a new function, and `NotificationBanner.tsx:26-30` depends on `onDismiss`. So every time another toast is added or removed, the 5 s timer of existing success toasts restarts, while the CSS progress bar (`globals.css:25`) does not. The bar and the actual dismissal drift apart. Fix: depend on `t.id` and call `dismiss` via a ref, or memoise the callback.
- (c) There is no pause on hover or focus. Success toasts are non-essential, so 2.2.1 is arguably satisfied, but pausing is a cheap best practice.
- (d) On mobile the toast sits at `top:12px` over the sticky app bar and its h1. The design says "below the app bar".

**Loading states:**
- RoleGuard and `/` use `role="status" aria-busy` with visible text. Good.
- The agency shifts skeleton (`agency/shifts/page.tsx:36`) is a bare `div aria-busy="true"` with no role or text, so screen readers get nothing. Add `role="status"` with an `sr` "Loading shifts".
- The error state (`:38-40`) is an EmptyState with no `role="alert"` and no retry button inside it. §12.3 requires "error (with retry)".

**Agency switcher (`agency-switcher.tsx`):**
- It uses `role="listbox"` with `<button role="option">` children (71-79), but **arrow-key navigation is not implemented**. Every option is a Tab stop, which contradicts the listbox pattern the role announces.
- Either implement roving `tabindex` with ArrowUp/Down, Home and End, or drop the listbox/option roles and use plain buttons with `aria-current="true"` (a disclosure pattern; simpler and honest).
- Also, focus leaving the menu by Tab does not close it.
- Escape, outside click and focus return are handled. Good.
- The agency name changing in the band after a switch is not announced. Consider a polite toast "Now working on Metro Care Partners".

**Reduced motion:**
- Skeleton: animation off.
- Toast timer bar: off.
- Spinner: slowed to 2.4 s, not stopped. Acceptable.
- No other transitions exist. Good.

**Colour only:** active nav uses background + weight + `aria-current`, and the active tab adds an indicator bar + weight. Badges are icon + label + tint. Good.

**Contrast (WCAG, computed):**

| Pair | Ratio | AA |
|---|---|---|
| ink / bg | 15.19 | pass |
| ink-2 / bg | 7.53 | pass |
| ink-3 (muted) / bg | 5.34 | pass |
| ink-3 / surface | 5.88 | pass |
| ink-3 / sunken (table header 12.5px) | 4.89 | pass (slim margin) |
| brand link / bg | 7.30 | pass |
| on-brand / brand (primary button, login aside) | 6.89 | pass |
| brand-ink / brand-soft (active nav, chip on) | 8.75 | pass |
| line-strong / surface (input border, UI 3:1) | 3.77 | pass |
| line-strong / bg | 3.42 | pass (UI) |
| focus / bg | 5.71 | pass |
| status open/filled/cancelled/completed/pending/rejected/expired fg on bg | 7.39 / 6.38 / 6.99 / 7.44 / 6.48 / 6.47 / 6.43 | pass |
| rejected-fg / surface (errmsg, danger) | 7.92 | pass |
| white on agency bands #A24A00 / #2F4FA3 / #6B3FA0 / #1F6B3A / #8A1F4D / fallback #44514E | 5.97 / 7.59 / 7.38 / 6.52 / 8.81 / 8.29 | pass |
| patch #F2B544 / bg | 1.66 | decorative only (logo); never use it for text or UI |
| line / surface (hairline) | 1.39 | decorative, OK |
| Dark: ink-3 / bg 7.02, on-brand / brand 8.22, line-strong / surface 3.93, status 8.4-8.8 | | pass (unreachable today) |

**Missing app-level states:** there is no `error.tsx`, `global-error.tsx`, `not-found.tsx` or `loading.tsx` anywhere under `app/`. Unknown routes and render errors fall back to Next's unstyled defaults. That fails "every view has loading/empty/error" and looks unprofessional.

---

## 6. Visual quality critique (does it read as a professional healthcare SaaS?)

**What works:**
- Restrained warm-neutral and deep-teal palette, a calm clinical tone, and strong AA contrast everywhere.
- A distinctive grotesk typeface.
- Badge system that never relies on colour.
- An agency band that makes the tenant context unmistakable (a real safety feature for multi-agency schedulers).
- The login split screen looks credible.

**Weaknesses as shipped today:**
1. **Every post-login screen is an icon tile + "X is coming".** A grader sees nine empty states in a row, so the product reads as a skeleton regardless of the design quality. This is the single biggest perceived-quality problem (the 6b work).
2. The nurse layout on desktop is a 480px strip on a large beige field with a floating tab bar. It looks unfinished next to the approved scale-up design.
3. The admin and agency headers lack page chrome:
   - no page subtitle or meta on audit and timesheets
   - no breadcrumb or "Updated 10 s ago" live pill
   - inconsistent H1 sizes (32 on dashboard, 28 elsewhere)
4. Copy tone is inconsistent: "Coverage is coming" and "Profile details are coming" sound like dev notes, not product empty states. Healthcare SaaS empty states should say what is true now and offer the next action ("No shifts posted yet. Post a shift").
5. Weight rounding (§3) makes buttons and headings slightly heavy and blunt compared with the design's 650/750.
6. There is no favicon (generic browser tab icon), no branded 404/error page, and the loading screens are a bare spinner.
7. Agency sign-out sits twice on desktop (header icon and the Profile page button), but on mobile only under Profile. Admin identity says "Hospital admin" while the design says "Operations admin". These are minor.
8. Agency colours are a separate palette with no relation to the brand. That is acceptable for distinguishing tenants, but the switcher tile and band should come from tokens with dark variants.

---

## 7. Findings

| # | Sev | Where | Finding | Recommendation |
|---|---|---|---|---|
| 1 | Critical (trial) | `app/(nurse|agency|admin)/**/page.tsx` | 11 of 15 required `data-testid`s are missing, and every feature screen is a placeholder (Stage 6b). | Build 6b per §2, test IDs first. |
| 2 | High | `components/shells/NurseShell.tsx:21-22` | No `<main>` landmark in the nurse area. | Wrap `{children}` in `<main id="main">` (render the AppBar inside it, or move the header out). |
| 3 | High | `globals.css:41,44` vs `docs/design/screens/Nurse-Scale-Up.dc.html` | The nurse UI is fixed at 480px on all screens; the design specifies a fluid 1/2/3-column layout with a side rail at ≥1000px. | Implement the scale-up grid and rail; hide the tab bar at ≥1000px. |
| 4 | High | `globals.css:86-89` | The admin shell wraps the main below a lone 248px sidebar between 720 and 887px (tablet). | Use `flex-wrap:nowrap` at ≥720px (or a grid `248px 1fr`), and set the mobile breakpoint at 888px or collapse the sidebar into a top bar or drawer. |
| 5 | High | `Toaster.tsx:14` + `NotificationBanner.tsx:26-30` | Inline `onDismiss` restarts the 5 s timer on every toast-store change. The timer bar and the real dismissal drift apart. | Stabilise the callback (`useCallback` per id, or a ref inside the banner); key the effect on `id` only. |
| 6 | Medium | `Toaster.tsx:10-12` | The live region is mounted only when it has content, so polite announcements are unreliable. | Keep a persistent `aria-live="polite"` and an `"assertive"` container mounted; render toasts into them. |
| 7 | Medium | `features/auth/login-form.tsx:43` vs `Login-Mobile.dc.html` | Auth errors appear only as a toast; the design has an inline form alert. | Render an inline `.alert.al-err role="alert"` above the fields, and move focus to it or keep it adjacent. |
| 8 | Medium | AgencyShell, AdminShell | No skip link (2.4.1). | Add a "Skip to content" link as the first focusable element -> `#main`. |
| 9 | Medium | `nurse/profile/page.tsx`, `agency/shifts/page.tsx`, `agency/profile/page.tsx` (`"use client"`, no metadata) | These pages have no page titles (all "ShiftPatch"). | Use a server wrapper page with `metadata`, or a segment `layout.tsx`. |
| 10 | Medium | `components/ui/EmptyState.tsx:10` | `<h3>` directly under `<h1>` on every placeholder page. | Add a `level` prop, defaulting to `h2`. |
| 11 | Medium | `features/agency/agency-switcher.tsx:71-79` | The listbox/option roles have no arrow-key support; every option is a Tab stop. | Implement roving `tabindex` (Up/Down/Home/End), or drop the roles and use buttons with `aria-current`. Close the menu on focus-out. |
| 12 | Medium | `apps/web/src/app/` | No `error.tsx`, `global-error.tsx`, `not-found.tsx` or `loading.tsx`. | Add branded versions that use EmptyState and a "Go to home" action. |
| 13 | Medium | `agency/shifts/page.tsx:36-40` | The skeleton has no accessible status; the error state has no `role="alert"` and no in-place Retry (§12.3 requires retry). | `role="status"` with sr text; error as `.alert.al-err` plus a Retry button. |
| 14 | Medium | `app/layout.tsx:7` | Loading weights 400-800 makes the CSS 550/650/750 round to 600/700/800, so the type is heavier than designed. | Omit `weight` to use the variable axis, or align the CSS weights to the loaded ones. |
| 15 | Medium | `tokens.css:26-40` | Dark theme tokens are unreachable: no `data-theme` setter, no `prefers-color-scheme`, no `color-scheme`. | Add `@media (prefers-color-scheme:dark){:root:not([data-theme=light]){…}}` plus `color-scheme:light dark`, and theme the hardcoded `#fff` and agency colours. Or explicitly de-scope dark mode in Decisions. |
| 16 | Medium | `globals.css:88` | Admin main has no max width; at 1920 the content spans about 1630px. | Cap the inner content at about 1440px, or centre it. |
| 17 | Low | `globals.css:44`, `tokens.css:176` | Fixed tab bars ignore the safe area. | `padding-bottom:calc(6px + env(safe-area-inset-bottom))` plus `viewportFit:"cover"` in `layout.tsx:14`. |
| 18 | Low | `globals.css:18` | The mobile toast covers the sticky app bar; the design says below it. | `top:calc(60px + 8px)` inside the nurse shell, or a CSS variable set per shell. |
| 19 | Low | `login-form.tsx:96`, `tokens.css:115` | The Show-password toggle is 36px (below the project's 44px rule) and uses both `aria-pressed` and a changing label. | Make it 44px tall inside the 48px input; use one state mechanism. |
| 20 | Low | `login/page.tsx:16` | The `<h2>` marketing headline comes before the `<h1>` in DOM order. | Make it a styled `<p>`. |
| 21 | Low | inline styles (39 across 11 files), `AdminShell.tsx:26-50`, `nurse/profile/page.tsx:15-22`, `admin/dashboard/page.tsx:10` | Layout, typography and colour are set inline; the H1 size is inconsistent (32 vs 28). | Move them to classes (`.page-head`, `.side-user`, `.profile-card`, `.btn-lg`); one `.page-h`. |
| 22 | Low | `globals.css` / `tokens.css` (38 px font sizes), `--t-*` used once | The type scale is defined but not used; off-scale sizes 12.5/13/15/17/19/20/24/32/44. | Map to `--t-*`, and add `--t-13`/`--t-15` if the design keeps them. |
| 23 | Low | `AgencyShell.tsx:24`, `Logo.tsx:8-21`, `lib/format.ts:9`, `globals.css:55-69` | 14 hardcoded colours. | Use `var(--c-ink-2)` and `var(--c-brand)`; add `--c-on-band` and `--agency-1..5` tokens with dark variants. |
| 24 | Low | `tokens.css:55` (`.ic`) | Mask icons may vanish in forced-colors mode (icon-only Sign out and Dismiss). | Add a `@media (forced-colors:active)` rule for `.ic`. |
| 25 | Low | `globals.css:54` | `.ag-user` email has no truncation; long emails squeeze the header nav at 720-900px. | `min-width:0; overflow:hidden; text-overflow:ellipsis; max-width:28ch`. |
| 26 | Low | no `app/icon.svg`, no `public/` | No favicon, although DESIGN.md specifies one. | Add `app/icon.svg` built from the 3-rect mark. |
| 27 | Low | nurse/agency sticky and fixed bars | 2.4.11 risk: focused items can scroll under the sticky app bar or the fixed tab bar. | Set `scroll-padding-top` and `scroll-padding-bottom` on `html` per shell. |
| 28 | Low | `AdminShell.tsx:12-16` | The design nav includes "Credentials (3)" (review queue); it is absent. | Confirm scope vs `ESCALATION.md`; add the nav item when the route exists. |
| 29 | Low | copy, `admin/dashboard/page.tsx:17`, `agency/profile/page.tsx:19` | "X is coming" reads as a dev note. | Use product empty-state copy with a next action. |
| 30 | Info | `login-form.tsx:57-106` | Good: labels, `aria-invalid`/`aria-describedby`, autocomplete, icon + text errors, `aria-busy`. Contrast passes AA for every token pair (§5). | Keep this as the pattern for the 6b forms (post shift, credential upload). |
