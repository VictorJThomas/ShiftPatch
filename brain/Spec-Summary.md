# Spec Summary (digest of [[docs/original/ShiftPatch-Technical-Spec]])

Source file wins on any doubt. Times 24h facility-local, no tz conversion.

## Seed data (exact)
| Agencies | Login | Pass |
|---|---|---|
| `agency-a` Sunrise Health Staffing | admin@sunrisehealth.example | Trial2026! |
| `agency-b` Metro Care Partners | admin@metrocare.example | Trial2026! |

| Nurses | Login | Credential |
|---|---|---|
| `nurse-1` Maria Lopez | maria.lopez@example.com | valid, expires 2027-01-01 |
| `nurse-2` James Cook | james.cook@example.com | expired 2026-06-01 |

Admin: `admin-1` Alex Kim, alex.kim@example.com, role admin. All passwords `Trial2026!`.

| Shift | Agency | Role | Date | Start–End | Status | claimedBy |
|---|---|---|---|---|---|---|
| shift-1 | agency-a | RN | 2026-10-02 | 19:00–07:00 | open | null |
| shift-2 | agency-a | LPN | 2026-10-03 | 07:00–19:00 | filled | nurse-1 |
| shift-3 | agency-b | RN | 2026-10-04 | 19:00–07:00 | open | null |

Roles: `nurse` | `agency` | `admin`.

## Routes (Bearer JWT; errors always `{ "error": "<msg>" }`)
Shift shape: `id, agencyId, agencyName, role, date, startTime, endTime, status, claimedBy` (null if open).

| # | Route | Notes |
|---|---|---|
| 1 | `POST /api/auth/login` | → `{ token, user:{id,name,role} }`; 401 `Invalid email or password` |
| 2 | `GET /api/shifts` | all shifts, both agencies → `{ shifts }` |
| 3 | `POST /api/shifts` | agency; body role,date,startTime,endTime; 201; scoped to caller's agency; next id `shift-7` in spec example |
| 4 | `POST /api/shifts/:id/claim` | nurse; checks credential expiry; 403 `Credential expired, cannot claim shift` |
| 5 | `POST /api/shifts/:id/cancel` | body `{reason: "no-show"|"advance"}`; reopens; adds `cancellation:{reason,previousNurseId}` |
| 6 | `GET /api/agencies/:agencyId/shifts` | → `{ agencyId, shifts:[{id,status,claimedBy}] }` |

Credential upload route: no contract, our design (test IDs still required).

## Required `data-testid`s (15)
`login-email-input`, `login-password-input`, `login-submit-button`, `shift-list-item`, `shift-claim-button`, `shift-cancel-button`, `credential-upload-input`, `credential-expiry-date-input`, `agency-post-shift-button`, `agency-post-shift-submit-button`, `admin-dashboard-shift-table`, `admin-shift-status-badge` (open/filled/cancelled), `audit-log-table`, `timesheet-table`, `notification-banner` (same ID for success AND error; differ by text).
