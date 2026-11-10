# Shared component contracts (feature/11-ui-ux-polish)

Owner: Shared Components Lead. Screen agents build against this; do not edit `components/ui/*`, `components/shells/*`, `tokens.css`, `globals.css`, `lib/format*` (ask the orchestrator). Existing primitives (StatusBadge, Dialog, ConfirmDialog, Field/Select, PageHeader, ChipGroup, ListSkeleton, ErrorState, EmptyState, useOnline/OfflineBanner, Toaster) are documented in `apps/web/src/components/ui/README.md`; their internals moved to Shadcn (see Foundation below), their props are unchanged. Tokens only (no zinc, no emoji, `Icon` for glyphs). Modules importing `@shiftpatch/contracts`/zod: `import "@/lib/zod-csp"` first.

Status legend: **ready** = merged in tree, **stub** = API fixed, implementation landing.

# Foundation: Tailwind v4 + Shadcn (Shared Components Lead, status: ready)

Full Shadcn + Tailwind migration; brand and tokens unchanged. **Feature agents: replace legacy classes with the components below (mapping table at the end of this section). Do not edit `components/shadcn/*`, `components/ui/*`, `globals.css`, `tokens.css`; ask the lead.**

## How the pieces fit
- Deps (apps/web): `tailwindcss` + `@tailwindcss/postcss` (v4), `postcss`, `radix-ui` (unified package), `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`. Config: `postcss.config.mjs`, `components.json` (`aliases.ui = "@/components/shadcn"`), `cn()` in `@/lib/utils`. No `tailwind.config`: v4 is CSS-first (`@theme` in `globals.css`).
- **Folders (case-insensitive filesystem!)**: Shadcn primitives live in `src/components/shadcn/` (lowercase files: `button.tsx`, `dialog.tsx`...). Composed shared components stay in `src/components/ui/` (`Dialog.tsx`, `AppDialog.tsx`...). Never put a lowercase Shadcn file in `ui/`: `dialog.tsx` and `Dialog.tsx` are the same file on Windows.
- **Cascade rule (most important gotcha)**: legacy CSS (`tokens.css` + the rest of `globals.css` + per-role css) is UNLAYERED; Tailwind lives in `@layer theme/utilities`. Unlayered always beats layered, regardless of specificity. So never put a legacy class and a Tailwind utility on one element for the same property (`className="btn p-0"` will NOT drop the padding). Migrate an element completely or not at all.
- **Preflight is not imported** (it would reset headings, lists, buttons that legacy screens rely on). Consequences: a native `<button>` still has the UA grey background unless it uses `Button` (or `.btn`); Shadcn components carry their own resets (`bg-transparent`, borders, font). The element rules in `tokens.css` (`a`; `button/input/select/textarea` font + color) skip `[data-slot]` elements, so Shadcn variants control their own color and font.
- **Tokens -> Shadcn variables** (`@theme inline` in `globals.css`, flips with `:root[data-theme=dark]`): `background`=--c-bg, `foreground`=--c-ink, `card/popover`=--c-surface, `primary`=--c-brand (`primary-hover`, `primary-foreground`=--c-on-brand), `secondary`=--c-surface, `muted`=--c-sunken, `muted-foreground`=--c-ink-3, `accent`=--c-brand-soft (`accent-foreground`=--c-brand-ink), `destructive`=--st-rejected-fg (`destructive-soft`=--st-rejected-bg), `border`=--c-line, `input`=--c-line-strong, `ring`=--c-focus, `scrim`. Radius `sm|md|lg|xl` = --r-*, shadows `sm|md|lg` = --e-1..3, `font-sans`=--f-sans. The stock Tailwind palette is disabled (`--color-*: initial`): `bg-red-500` does not exist. For status tints use `bg-[var(--st-open-bg)]` etc. (or `Badge`/`Alert` variants). Focus ring = the global `:focus-visible` outline (3px --c-focus), so do not add `focus-visible:ring-*`.
- **Portals and forms**: Radix portals dialogs and menus to `<body>`. A `<form>` that renders a Dialog no longer contains it in the DOM, so a submit button in `footer` needs `form="<form id>"` (the README rule); Enter-to-submit from inputs inside the dialog is gone unless the input also gets `form=`. Fixed in `UploadCredentialDialog` (the only offender).
- **Modal tests**: Radix marks everything outside an open modal `aria-hidden` and traps focus (like a real inert page). In tests, query page content behind an open dialog with `{ hidden: true }`; focus moves and returns on the next tick (use `waitFor`); jsdom needs a `ResizeObserver` stub for popovers and menus (see `FilterDropdown.test.tsx`); Radix menus open on `pointerdown` (`fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })`), popovers and dialog triggers on click; outside-click dismissal of a modal fires on pointerdown + click.
- **CSP**: prod CSP has `style-src 'unsafe-inline'` and no `unsafe-eval`. Tailwind is compile-time CSS; Radix, cva and tailwind-merge use no eval. Checked: the production `.next/static` JS contains no `eval(` and no `new Function`.

## Shadcn primitive audit (`components/shadcn/*`)
| Requested | Result | Why |
|---|---|---|
| Button | **migrated** `button.tsx` | 60 legacy `.btn` usages |
| Input, Textarea | **migrated** `input.tsx`, `textarea.tsx` (used through `Field`) | same 48px box as `.inp` |
| Select | **kept native** `<select>` in `ui/Field.tsx` `Select`, restyled with a lucide chevron | the OS picker is the best mobile control; the 7 usages are short fixed lists with no search |
| date / time | **kept native** `<input type="date\|time">` (use `Input type="date"`) | native pickers beat a Calendar popover on phones; no range or multi-select needed |
| Checkbox, Switch | **skipped** | zero usages |
| Radio | **skipped** | the 2 usages are visually-hidden native radios inside chip-style segmented controls; a Radix RadioGroup would only add wrapper markup |
| Form | **skipped** | Shadcn Form is a react-hook-form wrapper; `Field` already wires label, hint, error, `aria-describedby`, `aria-invalid`, and RHF is used directly |
| Dialog | **migrated** `dialog.tsx` (+ `ui/AppDialog.tsx`) | |
| Sheet | **skipped** | the mobile bottom sheet is `AppDialog` responsive classes; the filter panel is a viewport-capped popover; a third overlay primitive would be dead code |
| Popover | **added** `popover.tsx` | FilterDropdown. The agency switcher keeps its own listbox for now (feature-owned) |
| Dropdown menu | **migrated** `dropdown-menu.tsx` | AccountMenu |
| Table | **added** `table.tsx` | 6 `<table class="tbl">`; Admin/Agency agents may adopt it (legacy `.tbl` keeps working) |
| Badge | **migrated** `badge.tsx` | StatusBadge (all 8 statuses) + `count` variant |
| Tabs | **skipped** | zero `role=tab` usages; status "tabs" are `ChipGroup` toggle buttons (`aria-pressed`) |
| Calendar | **skipped** | see date |
| Tooltip | **skipped** | no usages; touch-first app, no hover-only information |
| Separator | **added** `separator.tsx` | FilterDropdown footer |
| Avatar | **skipped** | initials disc only (`.avatar`), no images to load or fall back |
| Alert | **added** `alert.tsx` | 12 `.alert` usages; OfflineBanner migrated. NotificationBanner stays legacy markup (timer-bar CSS + live-region contract, QA-003) |
| Skeleton | **migrated** `skeleton.tsx` | ListSkeleton |
| Toast | **skipped (kept custom)** | our Toaster has a persistent live region, one `notification-banner` id and the inline-in-modal behavior; Sonner would re-open QA-003 |

## AppDialog  (`components/ui/AppDialog.tsx`, status: ready)
- Props: `{ open; onClose(); title: string; description?: ReactNode; children?; footer?; size?: "sm"|"md"|"lg"|"xl"|"full" = "md"; blockClose?: boolean; className?: string; testId?: string }`. Same shape as the old `Dialog`; `variant` is replaced by `size`. `testId` becomes `data-testid` on the dialog box.
- Built on Shadcn `Dialog` (Radix): focus trap, focus returns to the opener (captured in a layout effect, because there is no `Dialog.Trigger`), Esc, overlay click, `aria-modal`, scroll lock. `blockClose` (uploads, mutations in flight): Esc, overlay and X do nothing and X is disabled; the parent still owns `open`.
- Layout: a flex column with `max-height: calc(100dvh - 2rem)`; header and footer are `shrink-0`; only the body scrolls (`overflow-y:auto`, `overflow-x:hidden`, `overflow-wrap:anywhere`, `overscroll-contain`). Footer wraps and right-aligns; below 720px the actions stack full width, 52px tall, primary on top (`.appdlg-foot` in `globals.css`, unlayered so it also beats legacy `.btn`).
- Responsive: below 720px `sm`/`md` are a bottom sheet (grab handle, `max-height: 92dvh`, 24px top corners); `lg`/`xl` are a near-full-height bottom sheet (`100dvh - 1rem`) because they hold long forms with the keyboard open; `full` is full screen at every width. `layout.tsx` sets `interactiveWidget: "resizes-content"` so Android shrinks the layout (and `dvh`) when the keyboard opens; iOS scrolls the focused field into view inside the body. The footer pads `env(safe-area-inset-bottom)`.
- Toasts: while open, the page Toaster yields. Each dialog renders `<Toaster inline dialogId={id} />`, but only the TOP dialog of the stack (`stores/dialogs.ts` keeps `stack: string[]`) is active, so stacked dialogs still give exactly one `notification-banner` and one announcement; a toast already announced is never re-announced by a lower dialog or the page after close (`AppDialog.stack.test.tsx`). Do not render a Toaster in children.
- Content mounts only while `open` and there is no exit animation (Radix unmounts at once), so a test id inside never exists twice and E2E does not wait for a fade-out.
- Example: `<AppDialog open={!!shift} onClose={close} size="md" title="Shift details" footer={<Button variant="secondary" onClick={close}>Close</Button>}>...</AppDialog>`

| size | max width | typical content | phones (<720px) |
|---|---|---|---|
| sm | 400 | confirmations | bottom sheet |
| md | 520 | details, short forms (default) | bottom sheet |
| lg | 720 | long forms, tables | near-full-height sheet |
| xl | 960 | wide tables, side by side | near-full-height sheet |
| full | viewport | immersive flows | full screen |

**Size of every current dialog** (feature agents set `size` when they migrate; until then the shim maps `variant` sheet/modal -> md, panel -> lg, and ConfirmDialog -> sm):
| Dialog | File | Size |
|---|---|---|
| Any `ConfirmDialog` (reject credential, withdraw shift, claim confirm) | `ui/ConfirmDialog.tsx`, `admin/UserDialogs.tsx`, `agency/shift-dialogs.tsx` WithdrawDialog | sm |
| Nurse shift details | `nurse/ShiftCard.tsx` | md |
| Credential details | `nurse/CredentialDetailDialog.tsx` | md |
| Add credential (upload) | `nurse/UploadCredentialDialog.tsx` | md (set `blockClose={upload.isPending}`) |
| Nurse details | `ui/NurseDetailDialog.tsx` | md |
| Agency shift details | `agency/shift-dialogs.tsx` | md |
| Cancel filled shift (reason radios) | `agency/shift-dialogs.tsx` | md |
| Post a shift | `agency/post-shift-form.tsx` | lg |
| Admin shift details | `admin/ShiftDetailsDialog.tsx` | md |
| Agency details | `admin/UserDialogs.tsx` | md |
| Audit "All changes" | `admin/AuditLog.tsx` | lg |

Stacked modals (ShiftDetailsDialog -> NurseDetailDialog) work: Radix keeps a layer stack.

## Dialog / ConfirmDialog (compat, status: ready)
- `Dialog` (`ui/Dialog.tsx`) delegates to `AppDialog`: `variant` is deprecated (`sheet|modal` -> md, `panel` -> lg), and `size` wins when given. The previous native `<dialog>` implementation is preserved as `ui/_legacy/NativeDialog.tsx.txt` (not compiled). Remove the shim when no screen passes `variant`.
- `ConfirmDialog`: same props; default `size="sm"`; `variant` is ignored; `pending` now also sets `blockClose`. Buttons are `Button` (`loading` gives the spinner and `aria-busy`); `confirmTestId` goes on the confirm button.

## FilterDropdown  (`components/ui/FilterDropdown.tsx`, status: ready)
- Purpose: trigger button + anchored panel for filters. Owns only interaction and presentation; the parent owns all filter state and what it means.
- Props: `{ label: string; activeCount: number; onApply?(): void; onReset(): void; children: ReactNode; onOpenChange?(open: boolean): void; applyLabel? = "Apply"; resetLabel? = "Reset"; className?; testId? }`.
- Modes: **immediate** (no `onApply`): controls change the query as the user clicks; the footer has only Reset (disabled while `activeCount === 0`). **Confirm** (`onApply` given): the footer has Reset (always enabled) + Apply; Apply calls `onApply` and closes. Reset never closes. Use `onOpenChange` to drop an unapplied draft when the panel closes by Esc or outside click.
- A11y: `Button` trigger (`aria-expanded`, `aria-haspopup=dialog`, Enter/Space open); the accessible name is `"<label>, <n> active"` when `n > 0`, else the label; the count badge is `aria-hidden` (no double reading). The panel is `role=dialog` named by `label`; Esc closes and returns focus to the trigger.
- Responsive: anchored (Radix Popper, flips and shifts, 8px collision padding); width `min(24rem, available width)`, max height = available height; the body scrolls and the footer stays pinned. At 360px the panel measured 344px wide in Chromium. No Sheet needed.
- Example: `<FilterDropdown label="Filters" activeCount={n} onReset={clear}><FilterGroup .../></FilterDropdown>`. `FilterBar`, `FilterGroup`, `ChipGroup` are unchanged and keep working.

## Migrated shared primitives (same props, new internals)
- `StatusBadge` -> `Badge variant={status}`; `data-testid` passes through; the cancelled label is struck through.
- `Field` -> Tailwind label, hint and error (lucide `AlertCircle`); `FieldControlProps.className` is still legacy `"inp"` / `"inp err"` so an unmigrated bare `<input {...p}>` keeps its look. **New code uses `<Input {...p} />`, `<Textarea {...p} />`, `<Select {...p} />`**: they drop those tokens and style the error state from `aria-invalid`. `Select` keeps the native `<select>` and `ref`; `className` goes on its wrapper.
- `EmptyState`, `ErrorState`, `ListSkeleton` -> Tailwind + `Button` + `Skeleton` (same roles: `h2`, `role=alert`, `aria-busy`, sr "Loading...").
- `AccountMenu` -> Shadcn `DropdownMenu` (Radix, `modal={false}`, `loop`): same props and contract (first item focused on open, arrows/Home/End, Esc returns focus, click outside closes, Space/Enter activate links). Radix opens on pointerdown, so unit tests use `fireEvent.pointerDown`.
- `OfflineBanner` -> `Alert variant="warning"`. Not migrated on purpose: `NotificationBanner`/`Toaster` (timer bar + live-region contract), `PageHeader`, `ChipGroup`, `DetailList`, `StatTile`, `SearchInput`, `FilterBar` (layout-only legacy CSS, no Shadcn equivalent), `Icon` (below).
- Icons: `Icon` (mask icons, `IconName`) is unchanged because 20+ files and legacy CSS depend on `.ic`. New Shadcn-based components use `lucide-react` directly. Do not pass lucide components to `Icon`; do not add `ic` classes to lucide svgs (the mask CSS would paint a solid square).

## Legacy class -> component mapping
| Legacy | New |
|---|---|
| `className="btn btn-primary"` | `<Button>` |
| `btn btn-secondary` | `<Button variant="secondary">` |
| `btn btn-ghost` | `<Button variant="ghost">` |
| `btn btn-danger` (outlined) | `<Button variant="danger">` |
| `btn btn-danger-solid` | `<Button variant="destructive">` |
| `btn btn-band` | `<Button variant="band">` |
| `btn-sm` | `size="sm"`: 44px tall by default and on touch, 36px only with a fine pointer at >=1024px (QA-011) |
| `btn-block` | `block` |
| `iconbtn` | `<Button variant="ghost" size="icon" aria-label="...">` |
| spinner `<span className="spin"/>` + `aria-busy` + `disabled` | `<Button loading>` |
| `<Link className="btn btn-primary">` | `<Button asChild><Link href=...>...</Link></Button>` |
| `<button type="submit" form={id} className="btn ...">` | `<Button type="submit" form={id}>` (type defaults to `button`) |
| `<input {...p}>` with `inp` | `<Input {...p} />`; `<textarea>` -> `<Textarea {...p} />` |
| `<Select>` | unchanged import from `@/components/ui/Field` |
| `badge b-*` / `StatusBadge` | `StatusBadge` (or `<Badge variant="open\|filled\|...">`) |
| `alert al-ok / al-err / al-warn / al-info` | `<Alert variant="success\|destructive\|warning\|info" role=...>` |
| `<table className="tbl">` | `Table, TableHeader, TableBody, TableRow, TableHead, TableCell` (optional; `.tbl` still works) |
| `.skel` | `<Skeleton className="h-4 w-1/2" />` |
| `<Dialog variant="sheet\|modal\|panel">` | `<AppDialog size="md\|lg">` (table above) |
| `<Dialog>` / `<ConfirmDialog>` | still work (shim) |
| chips in a `FilterBar` where a panel is wanted | `<FilterDropdown>` |
| `.card`, `.pad`, `.row`, `.col`, `.muted`, `.tnum`, `.sr` | unchanged (no Shadcn Card in scope) |


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
- Responsive: groups stack on phones, each chip row scrolls sideways; inside `.filter-panel` (FilterDropdown) chips wrap instead (QA-007).
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
- Props: `{ items: { label: string; value: ReactNode; icon?: IconName }[]; className? }` renders `<dl>` (auto-fit columns of at least 16rem, so one column inside md dialogs; `overflow-wrap:break-word`, QA-009). Entries with `value == null` or `""` are skipped.
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

## Credential upload screen (`features/nurse/CredentialUploadForm.tsx`, route `/nurse/credentials/new?type=`, status: ready, owner Nurse)
- One form: type, license type (license), screening date (TB, required), expiry date (required for license, optional otherwise), file. Only what `POST /api/nurses/me/credentials` accepts. Spec IDs `credential-upload-input` / `credential-expiry-date-input` exist here only, once each.
- Progress: indeterminate bar (`fetch` has no upload progress; XHR would bypass `apiFetch` refresh/401 retry).
- Unsaved-changes guard, from actual values (a cleared file is not dirty): beforeunload; Cancel and Back; plain left clicks on same-origin links anywhere (capture listener) open "Discard this credential?". Modified, middle, `_blank`, download, external and hash-only clicks pass through. Known gap: browser Back/Forward (popstate) is not guarded. In-flight upload blocks navigation without a dialog.
- Success: TanStack invalidates `["nurse","credentials"]` and `["shifts"]`, then `router.push("/nurse/credentials")`.
