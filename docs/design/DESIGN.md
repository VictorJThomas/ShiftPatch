# ShiftPatch — Design System (DESIGN.md)

Healthcare shift marketplace with three roles sharing one login:
- **Nurses** (mobile-first, 390×844): browse open shifts, claim, cancel, manage credentials.
- **Agencies** (desktop web): post shifts, see fills, cancel filled shifts.
- **Hospital admins** (desktop web, 1440): dashboard, credential review queue, audit log, timesheets, secure document preview.

Tone: calm, clinical, trustworthy. High legibility, zero decoration for its own sake. Times are facility-local, 24-hour.

## Brand
- Logo: two overlapping rounded squares ("patch" over a shift block) inside a rounded-square app icon (radius 25%). Wordmark: "Shift" weight 500 + "Patch" weight 800 in brand color, tracking -0.02em.
- Favicon: SVG with the same three rects.

## Color (light)
| Token | Hex | Use |
|---|---|---|
| bg | #F5F4EF | app background (warm off-white) |
| surface | #FFFFFF | cards, sheets, inputs |
| sunken | #ECEAE3 | table headers, tags, skeletons |
| line | #DDDBD1 | hairlines |
| line-strong | #868476 | input / secondary button borders |
| ink | #14201E | primary text |
| ink-2 | #44514E | secondary text |
| ink-3 | #5B6764 | muted text |
| brand | #0E5A55 | primary actions, active nav (deep teal) |
| brand-hover | #0A4743 | |
| brand-soft | #DCEEEA | selected chips, active nav bg, avatars |
| brand-ink | #0A4743 | text on brand-soft |
| on-brand | #E8EFEC | text on brand |
| patch | #F2B544 | accent (logo only, use sparingly) |
| focus | #1A5FB4 | 3px focus ring, 2px offset |
| scrim | rgba(14,24,22,.52) | modal/sheet overlay |

## Color (dark) — set `data-theme="dark"`
bg #0E1514 · surface #162120 · sunken #1D2B29 · line #2B3A38 · line-strong #6F7F7B · ink #E8EFEC · ink-2 #B2C0BC · ink-3 #93A39F · brand #5CC8BB · brand-hover #7AD6CB · brand-soft #173532 · brand-ink #A5E8DF · on-brand #062320 · focus #8DBBFF · scrim rgba(0,0,0,.62)

## Status system (bg / fg, light → dark)
Every status = **icon + label + tint**, never color alone.
| Status | Light bg/fg | Dark bg/fg | Notes |
|---|---|---|---|
| Open | #E3EEFB / #0F4C8A | #14263F / #9CC7FF | dot icon |
| Filled | #DDF0E6 / #17603A | #10301F / #8FDDB0 | check-circle |
| Cancelled | #ECEBE6 / #4A4F4D | #262B2A / #B8C0BE | label struck through |
| Completed | #EAE6F7 / #4A3A91 | #251F44 / #C4B8FF | |
| Pending | #FBEFD0 / #7A4B00 | #3A2A0A / #F5C76A | |
| Verified | #DDF0E6 / #17603A | #10301F / #8FDDB0 | shield icon |
| Rejected | #FBE3DF / #9A2519 | #3E1713 / #FFA79C | |
| Expired | #FDE6D2 / #8A3B05 | #3A1E08 / #FFB27A | 1.5px outline + diagonal hatch so it never reads as Pending |

Badge: pill, min-height 28px, 1px inset ring at 30% of fg, 13px/650.

## Typography — Schibsted Grotesk (Google Fonts), weights 400–800
Scale: 12 / 14 / 16 / 18 / 22 / 28 / 36 / 48. Headings 700–750 with tracking -0.02 to -0.03em. Tabular numerals for times, counts, tables. Body ≥16px on mobile, ≥14px on desktop. Fallback: system-ui.

## Spacing, radius, elevation
- Spacing 4px base: 4 8 12 16 20 24 32 40 48 64.
- Radius: sm 6 · md 10 · lg 16 · xl 24 (sheets top corners) · pill 999.
- Elevation: e1 `0 1px 2px rgba(20,32,30,.07)` · e2 `0 4px 14px rgba(20,32,30,.10)` · e3 `0 14px 36px rgba(20,32,30,.18)` (sheets, toasts).

## Icons
24px grid, 1.75–1.9 stroke, round caps/joins, single color (currentColor). 20px default, 24px in tab bars. Icons support text, never replace it (except labelled icon buttons). Set defined in `tokens.css` as `.i-*` mask classes: check, x, clock, alert, alert-circle, info, check-circle, x-circle, ban, dot, flag, shield, cal, cal-x, pin, search, upload, camera, file, user, brief, list, idcard, down, right, left, plus, grid, eye, refresh, building, phone, mail, arrow, inbox, lock, swap, moon, logout, wifi-off, note.

## Components (see `tokens.css` for exact CSS)
- **Button**: min-height 44px, radius md, 15px/650. Variants: primary (brand), secondary (surface + line-strong border), ghost, danger (outline), danger-solid. Block variant 52px tall / 16px on mobile primary CTAs.
- **Chip / segmented filter**: pill, 44px tall, `on` = brand-soft + brand border.
- **Input**: 48px, 1.5px line-strong border, radius md; error = 2px rejected-fg border + inline message with icon.
- **Alert / toast**: icon + bold title + message, 1.5px fg border, tinted bg. Success `role=status` auto-dismisses 5s; error `role=alert` persists. Toast placement: top of screen on mobile, top-right on desktop (24px inset, max 420px).
- **Shift card (nurse)**: agency name, role chip (dark pill e.g. "RN"), `Fri, Oct 2 · 19:00 → Sat 07:00`, tag (Overnight · 12 h), status badge, Claim shift (primary) + Details (secondary).
- **Bottom sheet**: radius xl top, grab handle, scrim; used for shift detail, claim confirm, cancel confirm.
- **Phone shell**: 390×844, app bar 60px, tab bar 72px with 4 tabs (Shifts, My shifts, Credentials, Profile), active tab has 3px brand top indicator.
- **Desktop shell**: left nav (`.navi`, 44px rows, active = brand-soft), stat tiles (40px numerals), data tables (sunken header, 12.5px header labels, hover tint), "live" pill with green dot.
- **Empty state**: 64px rounded glyph tile, 18px title, ≤34ch description, one action.
- **Skeleton**: shimmer, disabled under `prefers-reduced-motion`.

## Accessibility rules (non-negotiable — preserve in any redesign)
- Contrast ≥4.5:1 text, ≥3:1 large text/UI; focus ring always visible (3px).
- Touch targets ≥44px.
- Status never by color alone; real `<button>`, `<a>`, `<label>`.
- `aria-live`/roles on toasts, `aria-busy` on loading, `aria-current="page"` on active nav.

## Screens (25 artboards)
Brand sheet; Login (mobile error state, desktop split layout); Notification toast (success/error, light/dark);
Nurse: Available shifts · Loading/Empty/Error · Detail → Confirm → Claimed · License lapsed · My shifts (list/cancel/empty) · Credentials (list/upload/progress) · Profile · Scale-up (tablet/desktop);
Agency: Shifts · Post shift panel (validation) · Cancel filled shift · Loading/Empty/Error/Success · Account switcher · Profile · Shifts on mobile;
Admin: Dashboard · Credential review queue · Audit log · Timesheets (empty) · Loading/Error/Dark · Secure document preview.
Source for each lives in `screens/*.dc.html` (Design Component markup: plain HTML + inline styles using `tokens.css` classes; the `<x-dc>`, `{{holes}}` and `<script type="text/x-dc">` wrappers can be ignored).

## Open risks to improve (starting points)
- Copy is real-world plausible but placeholder (names, addresses, phone numbers are fake).
- Desktop screens are fluid (`expand: fill`); mobile are fixed 390×844.
- One brand accent (patch yellow) is only used in the logo; room to use it for highlights.
