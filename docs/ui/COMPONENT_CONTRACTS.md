# Shared component contracts (feature/11-ui-ux-polish)

Owner: Shared Components Lead. Screen agents build against this; do not edit `components/ui/*`, `components/shells/*`, `tokens.css`, `globals.css`, `lib/format*` (ask the orchestrator). Existing primitives (StatusBadge, Dialog, ConfirmDialog, Field/Select, PageHeader, ChipGroup, ListSkeleton, ErrorState, EmptyState, useOnline/OfflineBanner, Toaster) are documented in `apps/web/src/components/ui/README.md`: unchanged. Tokens only (no zinc, no emoji, `Icon` for glyphs). Modules importing `@shiftpatch/contracts`/zod: `import "@/lib/zod-csp"` first.

Status legend: **ready** = merged in tree, **stub** = API fixed, implementation landing.

## AccountMenu  (`components/ui/AccountMenu.tsx`, status: ready)
- Purpose: avatar button opening a dropdown with `Profile` (link, optional) and `Sign out` (uses `useLogout`). Replaces every sign-out icon button.
- Props: `{ profileHref?: string; placement?: "below" | "above"; detail?: { name: string; caption: string }; links?: { href: string; label: string; icon: IconName }[] }`.
  - `links` render as extra link menuitems before Profile (agency phones pass `Shifts`, since no nav is visible there).
  - `profileHref` omitted => menu shows only Sign out (admin: no profile page).
  - `detail` renders name + caption next to the avatar (rail/sidebar footer); `placement="above"` opens upward (rail footers).
- Behavior: click toggles; Esc closes and returns focus to the trigger; click outside closes; ArrowDown/ArrowUp/Home/End move between items; Tab closes; opening via ArrowDown/Enter/Space focuses the first item; Space activates a focused link item (Enter is native). Not hover-only.
- A11y: trigger `<button aria-haspopup="menu" aria-expanded aria-label="Account menu" aria-controls>`; popup `role="menu"`, items `role="menuitem"`.
- Responsive: popup min 192px, right aligned, never wider than viewport.
- Usage: `<AccountMenu profileHref="/nurse/profile" />`. Screen agents normally never render it: shells do. Nurse pages keep `<AppBar title><UserAvatar /></AppBar>`; `UserAvatar` now renders the AccountMenu (hidden at >=1000px where the rail has one).
- Testing note: Sign out is now inside the menu: open it first (`getByRole("button", {name: "Account menu"})` then `getByRole("menuitem", {name: "Sign out"})`). Profile is a `menuitem` link, not a tab. Nurse mobile tabs: Shifts, My shifts, Credentials (3). Profile link in the desktop rail stays (role=link name "Profile").
- Existing in-page "Sign out" buttons (nurse Profile row, agency profile) are feature-owned and untouched.

## Shell decisions
- Nurse: rail (>=1000) keeps 4 links incl. Profile + rail-user AccountMenu; tabbar is 3 tabs (grid 3 cols). AppBar avatar menu reachable top right on every page below 1000.
- Agency: mobile (<720) has no header: AccountMenu sits at the right of the agency band. Mobile tab bar **removed** (one remaining tab is pointless; Shifts and Profile reachable via the band menu, `links` prop). Desktop header nav keeps Shifts + Agency profile; its AccountMenu links to `/agency/profile`. `ag-main` mobile bottom padding reduced accordingly.
- Admin: AccountMenu (Sign out only) in the sidebar footer (opens upward) / top bar below 960px (opens downward via `.adm-side .acct-menu`, so it stays on screen). No profile route. Nav list is the shell's `NAV` array: the Admin agent adds `/admin/users` via the orchestrator (or tell the lead).

## Centered layout (globals.css, status: ready)
`.nurse-main`, `.ag-main`, `.adm-main` stay centered (`margin-inline:auto`) in the space right of the rail. `.nurse-narrow` pages (640px) are now centered too, and AppBar + `.body` share one content width, so headings align with content. Pages must not add their own left-aligned max-width wrappers; use `.nurse-narrow` or `margin-inline:auto`.

## FilterBar + FilterGroup  (`components/ui/FilterBar.tsx`, status: ready)
- Purpose: labelled filter groups (Date / Role / Status) composing `ChipGroup`; always server-side filters: onChange updates query params, never filters locally.
- `FilterBar`: `{ label?: string = "Filters"; children: ReactNode; trailing?: ReactNode }` (`role="group"`; trailing = e.g. SearchInput or Clear button).
- `FilterGroup<T>`: `{ label: string; options: { value: T; label: string; count?: number }[]; value: T; onChange(v: T): void }` renders a visible small caption (the label) + `ChipGroup` (group name = label).
- Behavior: groups wrap; a vertical divider separates groups >=900px; chips with `count === 0` get `data-zero` (opacity .55) but remain buttons and operable. (ChipGroup itself now adds `data-zero`.)
- Responsive: groups stack on phones, each chip row scrolls sideways.
```tsx
<FilterBar trailing={<SearchInput label="Search shifts" value={q} onChange={setQ} />}>
  <FilterGroup label="Date" value={date} onChange={setDate} options={dateOpts} />
  <FilterGroup label="Role" value={role} onChange={setRole} options={roleOpts} />
</FilterBar>
```

## SearchInput  (`components/ui/SearchInput.tsx`, status: ready)
- Props: `{ label: string; value: string; onChange(v: string): void; placeholder?; delay?: number = 300; className?; testId? }`.
- Behavior: local text state; `onChange` is debounced (trailing) by `delay`; external `value` change resyncs; Esc clears (immediate). Visible label is sr-only (`.sr`), `type="search"`, search icon decorative.
- Use the debounced value as the query-key param.

## DetailList  (`components/ui/DetailList.tsx`, status: ready)
- Props: `{ items: { label: string; value: ReactNode; icon?: IconName }[]; className? }` renders `<dl>` (two columns >=480px, stacked below). Entries with `value == null` or `""` are skipped.
```tsx
<DetailList items={[{ label: "Email", value: nurse.email, icon: "mail" }, { label: "License", value: nurse.licenseType }]} />
```

## StatTile  (`components/ui/StatTile.tsx`, status: ready)
- Props: `{ label: string; value: ReactNode; icon?: IconName; hint?: string; testId?: string; tone?: "default" | "brand" }`. Card with big tabular number (uses `.card .stat` look). Not a heading. Use in a `.stat-grid` (auto-fit minmax 200px) wrapper (class provided).

## NurseDetailDialog  (`components/ui/NurseDetailDialog.tsx`, status: ready, presentational)
- Props: `{ open; onClose; nurse?: NurseDetailData; loading?: boolean; error?: string; onRetry?(): void; footer?: ReactNode; title?: string = "Nurse details"; credentialActions?: (c) => ReactNode }`. `credentialActions` renders per-credential buttons (admin Verify / Reject) in each row.
- `NurseDetailData` is the contracts `NurseDetail` type (`GET /api/shifts/:id/nurse`, `GET /api/admin/nurses/:id`). Credential names come from `@/lib/credential-label` (`credentialLabel`, `credentialTypeLabel`), the one label source. The claiming-nurse query is the shared `useShiftNurse` in `@/lib/shift-nurse` (agency and admin).
- Renders in shared `Dialog` (modal variant): loading => `ListSkeleton`, error => `ErrorState`, else DetailList (name, email, license) + credentials list with `StatusBadge` + expiry (`formatDate`), empty => "No credentials on file".
- Feature code does the fetching; lazy-load with `next/dynamic` if desired.

## Shared helpers
- `showError(err)` : `@/lib/format-error` (status: ready). `notify.error(err instanceof ApiError ? err.message : "Something went wrong. Try again.")`. **Nurse and Agency agents must switch** `features/nurse/queries.ts` (exported `showError`) and `features/agency/queries.ts` (local const) to import it and delete the local copies.
- Formatting: existing `@/lib/format` (`formatDate`, `formatShiftWhen`, `shiftHours`, `isOvernight`, `initials`...). Added: `formatShiftEcho({date,startTime,endTime,role?})` -> "Sat, Oct 3, 2026 · 07:00 → 19:00 · 12 h · Overnight" for the form echo (status: ready).

## Global CSS behaviors (status: ready)
- `cursor:pointer` on `button, a[href], summary, select, [role=button], [role=menuitem], label[for], input[type=checkbox|radio|file|date|time]`; `:disabled`/`[aria-disabled=true]` => `not-allowed`.
- `select` and `option` get inline padding; `.inp` wrapper pads, the select itself has no extra left padding (no double padding).
- Toaster: bottom-right >=1000px (24px inset, max 420px); below that it stays at the top (the nurse bottom tab bar, visible until 1000px, must stay uncovered). Live region and `notification-banner` unchanged.
