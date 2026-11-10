# UI primitives (`@/components/ui/*`)
Small, typed. Internals now compose Shadcn (`@/components/shadcn/*`, Radix + Tailwind v4); props unchanged. Full catalog, size table and legacy-class mapping: `docs/ui/COMPONENT_CONTRACTS.md`. Status = icon + label + tint.

| Primitive | Signature |
|---|---|
| `StatusBadge` | `{ status: "open"\|"filled"\|"cancelled"\|"completed"\|"pending"\|"verified"\|"rejected"\|"expired"; testId?: string }` |
| `Dialog` | `{ open; onClose; title: string; description?; children?; footer?; variant?: "sheet"\|"modal"\|"panel" }` (default modal) |
| `ConfirmDialog` | `{ open; onClose; onConfirm; title; children?; confirmLabel; cancelLabel?="Go back"; tone?: "primary"\|"danger"; pending?; confirmTestId?; variant?="sheet" }` |
| `Field` | `{ label; hint?; error?: string; required?; children: (p: FieldControlProps) => ReactNode }` |
| `Select` | native `<select>` props; `className` styles the `.inp` wrapper (spread Field's `p`) |
| `PageHeader` | `{ title: string; description?; actions? }` → h1 `.page-h` |
| `ChipGroup<T>` | `{ label: string; options: { value: T; label: string; count?: number }[]; value: T; onChange(v: T) }` |
| `ListSkeleton` | `{ rows?=3; variant?: "card"\|"table" }` (`aria-busy`, sr "Loading…") |
| `ErrorState` | `{ title?; message: string; onRetry(): void }` (`role="alert"`, Retry button) |
| `EmptyState` | `{ icon: IconName; title; children?; action?: ReactNode }` (h2) |
| `useOnline()` / `OfflineBanner` | `boolean` / `{ message? }` (renders only while offline) |
| `NotificationBanner`, `Toaster` | unchanged API; use `notify.success/error` from `@/stores/toasts` |
| Shell exports | `AppBar({ title, children? })`, `UserAvatar()` (renders `AccountMenu`) from `@/components/shells/NurseShell` |
| New (feature/11) | `AccountMenu`, `FilterBar`/`FilterGroup`, `SearchInput`, `DetailList`, `StatTile`, `NurseDetailDialog`, `@/lib/format-error` `showError`: see `docs/ui/COMPONENT_CONTRACTS.md` |

```tsx
<StatusBadge status={shift.status} testId="admin-shift-status-badge" />
<ConfirmDialog open={!!target} title="Claim this shift?" confirmLabel="Confirm claim" confirmTestId="..."
  pending={claim.isPending} onConfirm={() => claim.mutate(target.id)} onClose={() => setTarget(null)}>…</ConfirmDialog>
<Dialog open={open} onClose={close} title="Post a shift" variant="panel" footer={<button className="btn btn-primary" form="post">Post shift</button>}>
  <form id="post">…</form></Dialog>
<Field label="Date" error={errors.date?.message}>{(p) => <input {...p} type="date" {...register("date")} />}</Field>
<Field label="Role" error={errors.role?.message}>{(p) => <Select {...p} {...register("role")}><option value="RN">RN</option></Select>}</Field>
<PageHeader title="Shifts" description="3 open" actions={<button className="btn btn-primary">Post shift</button>} />
<ChipGroup label="Role" value={role} onChange={setRole} options={[{ value: "all", label: "All", count: 4 }]} />
{q.isPending ? <ListSkeleton variant="table" /> : q.isError ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} /> : …}
<EmptyState icon="inbox" title="No shifts match" action={<button className="btn btn-secondary">Clear filters</button>}>Try another date.</EmptyState>
```

Notes
- `Dialog` is now a shim over `AppDialog` (Radix Dialog): focus trap, Esc, overlay close, focus return, `dvh` max height, pinned header/footer, scrolling body. Prefer `AppDialog` with `size` (`sm|md|lg|xl|full`). Content mounts only while `open`.
- Dialog sizes (legacy `variant`): `sheet`/`modal` -> `md`, `panel` -> `lg`. Below 720px: bottom sheet (`lg`/`xl` near full height). Footer buttons stack full-width (52px) on phones. The dialog is portaled to `<body>`, so put the form's submit in `footer` with `form="<form id>"`.
- `Field` passes `id`, `className` ("inp" / "inp err"), `aria-describedby`, `aria-invalid`, `required`.
  With react-hook-form spread `register()` after `p`. Use `noValidate` on the form if you rely on zod messages.
- Tests: Radix dialogs/menus work in jsdom without stubs, but popovers/menus need a `ResizeObserver` stub; see `AppDialog.test.tsx`, `FilterDropdown.test.tsx`.
- Toasts: success is announced once by the Toaster's persistent `role="status"` region; errors are `role="alert"`.

## CSS utilities (`app/globals.css`)
- `.card-grid`: 1 col <700px, 2 cols ≥700, 3 cols ≥1000 (nurse shift cards).
- `.skip`: skip link, visible on focus (every shell; targets `<main id="main" tabIndex={-1}>`).
- `.page-head` `.page-sub` `.page-actions` (PageHeader) · `.chips` `.chip-n` (ChipGroup) · `.inp-select`.
- `.dlg` `.dlg-{sheet,modal,panel}` `.dlg-head` `.dlg-body` `.dlg-foot` (Dialog) · `.sr` = visually hidden (tokens).
- Nurse shell: `.nurse-shell` `.nurse-main` (max 880px <1000, 1200px ≥1000) `.nurse-rail` (≥1000) `.nurse-tabs` (<1000).
- Admin: `.adm-main` max 1440px; sidebar becomes a top bar below 960px. `.rail-user` = avatar + name + sign out.
