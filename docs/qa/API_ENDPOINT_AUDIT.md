# ShiftPatch API Endpoint Audit (read-only)

Branch `qa/10-full-audit` @ feb5efb, 2026-11-07. Sources: `docs/original/ShiftPatch-Technical-Spec.md` (Spec), `docs/ARCHITECTURE.md` (Arch), `apps/api/src/**`, `packages/contracts/src/index.ts` (contracts), `apps/web/src/**`, `apps/web/e2e/mock-api.ts`, `docs/postman/`, `docs/design/screens/*.dc.html`.
Path shorthands: `shifts/routes` = `apps/api/src/modules/shifts/routes.ts`; `shifts/service`, `shifts/policy` likewise; `contracts` = `packages/contracts/src/index.ts`; `contract-test` = `apps/api/src/contract/required-routes.contract.test.ts`.

**Headline:** all 6 spec routes and 7 extra routes are implemented, contract-validated (`z.strictObject` response parse in every handler) and tested; the Postman collection is current (`export.mjs --check` -> `OK, 17 requests (7 extra routes)`). The gap is on the other side: the web app calls only 5 endpoints (auth x3, `/api/me`, agency shifts). 8 implemented endpoints have no UI, 11 of the 15 required `data-testid`s are missing, and 13 Arch §8.4 endpoints (credentials, coverage, shift details, agency profile, facilities) are not built.

---

## 1. Inventory

Legend. Req: S = Spec, A = Arch, F = existing frontend, R = recommended by design screens. Contract: Y = zod schema in contracts and parsed on the way out. Auth column quotes the effective rule from service/policy code. All authenticated routes use `onRequest: [authenticate, loadActor]` (`authz/plugin.ts:40-69`): 401 `Unauthorized` for a missing/invalid token or a deleted/suspended user, 403 `Agency not available` for a bad `X-Agency-Id`.

### 1a. Mandatory spec endpoints

| Method | Endpoint | Req | Frontend consumer | Backend | Contract | Auth / permission (code) | Tests |
|---|---|---|---|---|---|---|---|
| POST | `/api/auth/login` | S A F | `features/auth/session-flow.ts:35` (login-form) | Implemented `auth/routes.ts:66-76` | Y `LoginRequest`/`LoginResponse` (`contracts:63-70`), body exactly `{token,user{id,name,role}}` (`auth/routes.ts:63`) | Public. Failure-only rate limit 10/min per IP and per email hash (`auth/routes.ts:51-58`), 429 `{error}`. Any malformed body -> **401** (`:68-73`), not 400 | `auth/auth.test.ts`, `contract-test`, `security.test.ts`, `audit/audit-logs.test.ts`; web `e2e/auth.spec.ts` (mocked) |
| GET | `/api/shifts` | S A (F: none) | **none** | Implemented `shifts/routes:21-29` -> `shifts/service:20` | Y `ListShiftsResponse` (`contracts:74`), full Shift shape | Any authenticated active actor, any role incl. agency viewer. No policy, `marketplaceScope` only checks `status==="active"` (`authz/scope.ts:45-48`) | `shifts/shifts.test.ts:93-116`, `contract-test:110`, `authz/matrix.test.ts`, `security.test.ts` |
| POST | `/api/shifts` | S A | **none** (no post form) | Implemented `shifts/routes:41-45` -> `shifts/service:48-95` | Y `CreateShiftRequest` (strips extra keys) / `CreateShiftResponse` (`contracts:81-90`) | `can("shift:create")` (`shifts/policy:33`): agency role, owner/manager of the validated active agency (`authz/decision.ts:34-43`). Viewer/nurse/admin 403; multi-agency without header 400 `Select an agency`. Authz runs **before** body validation (`service:49-53`) | `shifts.test.ts:208-303`, `contract-test:138-156`, `matrix.test.ts` |
| POST | `/api/shifts/:id/claim` | S A | **none** | Implemented `shifts/routes:48-54` -> `shifts/service:103-131` | Y `ClaimShiftResponse` (`contracts:100-101`); body ignored; empty JSON body tolerated (`app.ts:57-63`) | `shift:claim` (`policy:43-46`): nurse role (else 403), nurse network = shift network (else **404**, no existence leak). Then license check under `FOR SHARE` -> 403 exact `Credential expired, cannot claim shift` or `No valid credential on file...` (`service:111-113`); 409 `Shift is no longer open` (`:115-117`) | `claim-cancel.test.ts`, `contract-test:159-175`, `matrix.test.ts`, `shifts/eligibility.test.ts` |
| POST | `/api/shifts/:id/cancel` | S A | **none** | Implemented `shifts/routes:57-63` -> `shifts/service:175-237` | Y `CancelShiftRequest`/`CancelShiftResponse` incl. `cancellation{reason,previousNurseId}` (`contracts:105-111`) | `shift:cancel` (`policy:35-41`): nurse only if `claimedBy===self` **and** reason `advance`; else network admin, or owner/manager of the owning agency via `agencyWrite`. 409 `Shift is not filled`. **Order: 404 -> 400 body -> 403** (`service:186-193`), see F-6 | `claim-cancel.test.ts`, `contract-test:178-196`, `matrix.test.ts`, `db/constraints.test.ts` |
| GET | `/api/agencies/:agencyId/shifts` | S A F | `app/(agency)/agency/shifts/page.tsx:17` (count only) | Implemented `shifts/routes:32-38` -> `shifts/service:38-45` | Y `AgencyShiftsResponse = {agencyId, shifts: Shift[]}` (`contracts:131`), the **full** 9-field shape | `shift:read-agency` (`policy:25-30`): any member (viewer included) of `:agencyId`, or an admin of that agency's network. Unknown, foreign or malformed id -> same 403 `Forbidden` (`routes:34`, `service:40`) | `contract-test:117-135`, `shifts.test.ts:175-201`, `matrix.test.ts`; web `e2e/agency.spec.ts` (mocked) |

### 1b. Additional, Arch-defined (§8.4, `ARCHITECTURE.md:880-901`)

| Method | Endpoint | Req | Frontend consumer | Backend | Contract | Auth / permission | Tests |
|---|---|---|---|---|---|---|---|
| POST | `/api/auth/refresh` | A F | `lib/api-client.ts:75` (single-flight, 409 retry) | Implemented `auth/routes.ts:78-90` | Response = `LoginResponse`; no request schema (cookie) | Refresh cookie (`Path=/api/auth`, httpOnly, SameSite=Strict); Origin must be absent or `APP_ORIGIN` (403); 30/min/IP; 409 on lost rotation race | `auth.test.ts`, `security.test.ts`, `audit-logs.test.ts`; web `api-client.test.ts` |
| POST | `/api/auth/logout` | A F | `session-flow.ts:49`, `use-logout.ts` | Implemented `auth/routes.ts:92-98` | none (204 empty) | Cookie, Origin check, 30/min/IP. Does not kill the live access token (Arch §7 "known limit") | `auth.test.ts`, `audit-logs.test.ts` |
| GET | `/api/me` | A F | `session-flow.ts:17` (`fetchMe`) | Implemented `me/routes.ts:11-35` | Y `MeResponse` (`contracts:123-127`) | Any authenticated user; `ignoreAgencyHeader: true` (`me/routes.ts:9`); profile-less user -> 401 (`:29`) | `me/me.test.ts` |
| POST | `/api/shifts/:id/withdraw` | A | **none** | Implemented `shifts/routes:66-72` -> `service:137-161` | Y `WithdrawShiftResponse` (`contracts:115`) | `shift:manage` (`policy:34`): network admin or owner/manager of the owning agency. Non-member/out-of-scope/any admin miss -> 404; nurse/viewer -> 403; 409 if not open | `matrix.test.ts`, `me/me.test.ts` (no dedicated withdraw suite) |
| GET | `/api/nurses/me/shifts` | A | **none** (my-shifts page is an empty state) | Implemented `shifts/routes:75-79` -> `service:164-168` | Y `NurseShiftsResponse` (`contracts:119`) | `shift:list-mine` (`policy:50`): nurse only | `me/me.test.ts` |
| GET | `/api/shifts?matchable=true` | A | **none** | Implemented (same handler, `routes:25-28`, `service:23-35`) | `ListShiftsQuery` (`contracts:76`), bad value -> 400 | `shift:list-matchable` (`policy:48`): nurse with a network | `shifts.test.ts:116-163` |
| GET | `/api/audit-logs` | A | **none** (audit page is an empty state) | Implemented `audit/routes.ts:11-18` -> `audit/service.ts:42-86` | Y `AuditLogQuery`/`AuditLogResponse {items, nextCursor}` (`contracts:136-159`) | `authorizeAuditRead` (`audit/service.ts:42-62`) + `audit:read` (`audit/policy.ts:13-21`): admin = all active networks; agency owner/manager = active agency rows; viewer/nurse 403; multi-agency w/o header 400. Authz before query validation | `audit/audit-logs.test.ts`, `matrix.test.ts` |
| GET | `/api/health` | A | none (infra) | Implemented `app.ts:84`, returns `{status:"ok"}` | none | Public | `app.test.ts:5-7`, `authz.test.ts:67` (exclusion), `security.test.ts` |
| PATCH | `/api/me/profile` | A | none (profile pages are read-only) | **Missing** | none | Arch: logged-in user | none |
| POST | `/api/me/avatar` | A | none | **Missing** | none | Arch: logged-in user | none |
| GET | `/api/shifts/:id/details` | A R | none (needs `Nurse-Detail-Claim`) | **Missing** | none | Arch: logged-in user | none |
| GET | `/api/agencies/:id` | A R | none (needs `Agency-Profile`, shift-detail contact) | **Missing** | none | Arch: logged-in user | none |
| PATCH | `/api/agencies/:id` | A R | none | **Missing** | none | Arch: agency owner/manager, admin | none |
| GET | `/api/nurses/me/credentials` | A R | none | **Missing** (`modules/credentials/` = `policy.ts` only) | none | Arch: nurse | none |
| POST | `/api/nurses/me/credentials` | A R (spec test IDs) | none | **Missing** | none | Arch: nurse, multipart | none |
| GET | `/api/credentials/:id/download-url` | A R | none | **Missing** | none | Arch: owner nurse, network admin, agency while nurse holds its shift (policy exists in `credentials/policy.ts`) | `authz/policy.test.ts` (policy only) |
| PATCH | `/api/credentials/:id/review` | A R | none | **Missing** | none | Arch: admin | none |
| GET | `/api/admin/credentials?status=pending` | A R | none | **Missing** | none | Arch: admin | none |
| GET | `/api/admin/coverage?from&to` | A R | none | **Missing** | none | Arch: admin | none |
| GET/POST | `/api/facilities` | A R | none | **Missing** (only consumed indirectly via `facilityId` on create, `service:59-62`) | none | Arch: read any user, write admin | none |
| DELETE | `/api/shifts/:id` | A | none | **Missing** | none | Arch: admin, soft delete | none |

### 1c. Required by the existing frontend

| Call site | Method + path | Backend | Status |
|---|---|---|---|
| `features/auth/session-flow.ts:35` | POST `/api/auth/login` | `auth/routes.ts:66` | OK, schema-validated client side |
| `lib/api-client.ts:75` | POST `/api/auth/refresh` | `auth/routes.ts:78` | OK |
| `features/auth/session-flow.ts:49` | POST `/api/auth/logout` | `auth/routes.ts:92` | OK (204 handled `api-client.ts:167`) |
| `features/auth/session-flow.ts:17` | GET `/api/me` | `me/routes.ts:11` | OK, no `X-Agency-Id` sent (`api-client.ts:45`) |
| `app/(agency)/agency/shifts/page.tsx:17` | GET `/api/agencies/${agencyId}/shifts` | `shifts/routes:32` | OK. Path segment not `encodeURIComponent`'d (safe today: ids come from `/api/me` and match `Id` regex) |

No frontend request lacks a backend route. Every other page (`nurse/shifts`, `nurse/my-shifts`, `nurse/credentials`, `admin/dashboard`, `admin/audit`, `admin/timesheets`, `agency/profile`) is a static `EmptyState` with no fetch.

### 1d. Recommended future (Stage 6b/7 design screens)

| Screen (`docs/design/screens/`) | Needs | Exists? |
|---|---|---|
| `Nurse-Shifts`, `Nurse-Shift-States` | `GET /api/shifts?matchable=true`, claim | Yes, unconnected |
| `Nurse-License-Lapsed`, `Nurse-Scale-Up` | fallback (Arch §12.4, `ARCHITECTURE.md:1073-1076`): `GET /api/nurses/me/credentials` + `GET /api/shifts` | credentials GET missing |
| `Nurse-Detail-Claim` | facility name/unit, street address, pay `$48/hour`, description, agency contact phone/email | `GET /api/shifts/:id/details` missing; DB has `shifts.description`, `payRateCents`; facilities/agencies have **no street-address column** (only city/state/postal: `db/schema/identity.ts:62-84,131-160`) |
| `Nurse-My-Shifts` | `GET /api/nurses/me/shifts`, cancel (`advance`) | Yes, unconnected |
| `Nurse-Credentials` | list (type, status, valid-until, reject note), upload (type, file, expiry / TB date) | Missing (GET + POST) |
| `Agency-Shifts`, `Agency-Cancel`, `Agency-Mobile` | agency list, cancel (no-show/advance), withdraw | Yes, unconnected |
| `Agency-Post-Shift` | role, date, times, **facility, description, pay rate** | POST exists, but `CreateShiftRequest` accepts only `role,date,startTime,endTime,facilityId` (`contracts:81-89`): description/pay are silently stripped; no facility list endpoint for the picker |
| `Agency-Profile` | name, contact email, phone, address, logo | `GET/PATCH /api/agencies/:id` missing; no logo upload route in Arch |
| `Agency-Switcher` | `/api/me` | Yes, wired |
| `Admin-Dashboard` | shift table + per-status/per-agency counts, filters (agency/status/date), 15 s refetch, **"Claimed by Maria Lopez"** (name) | Table can use `GET /api/shifts` (ids only); counts/filters/names need `GET /api/admin/coverage` (missing) |
| `Admin-Credentials`, `Admin-Doc-Preview` | review queue, verify/reject with note, signed preview link | All missing |
| `Admin-Audit` | rows with **user names**, item labels, **role** filter, action filter, date range, text search, page numbers "1-8 of 42" | Endpoint exists with ids only, cursor paging (no total), filters `entityType/entityId/action/from/to` only (`contracts:136-144`) |
| `Admin-Timesheets` | Nurse, Shift, Clock in, Clock out, Status; design's state is the empty table | No table (`timesheets` is [Future], `ARCHITECTURE.md:539`), no route in Arch |

---

## 2. Specific checks

1. **`GET /api/health` does not check the DB.** `app.ts:84` returns `{status:"ok"}` statically, and `app.ts:52` says so on purpose ("route probes and /api/health never connect"). Arch `ARCHITECTURE.md:901` claims "Liveness and database check". Fix the doc, or add a readiness probe (`GET /api/health/ready` running `select 1`, 503 `{error:"Database unavailable"}`) and keep `/api/health` as liveness for Railway.
2. **`GET /api/agencies/:agencyId/shifts` shape.** The code returns the full 9-field Shift per item (`contracts:131` -> `Shift` strict, `routes:37`). The spec prose says "same shape as above" (Spec `:182`), and its example `{id,status,claimedBy}` is an abbreviation. The full shape follows the normative text. The contract test asserts the full shape exactly: `contract-test:123` (`toEqual(SEED_SHIFTS.slice(0,2))`) and `:129` (`{agencyId:"agency-b", shifts:[SEED_SHIFTS[2]]}`). Risk: a grader doing deep-equality against the abbreviated example would fail, but `toMatchObject`/subset checks pass. No change recommended; note it in the README/Decisions.
3. **`POST /api/shifts` validation.** It rejects: role outside `RN|LPN|CNA` (case-sensitive, `"rn"`/`"MD"` -> 400), impossible dates (`2026-02-30`), non-ISO dates, times that are not `HH:MM` 24h (`7am`, `7:00`, `24:00`, `19:00:00`), and `startTime === endTime` (`contracts:15-18,81-89`). Tests: `shifts.test.ts:268-279`, `packages/contracts/src/index.test.ts:100-110,201-203`, `contract-test:149`. Gaps: (a) past dates are accepted (open product decision, Status "Next step 4"); (b) the 400 text is zod's first raw issue (`service:53`, e.g. `Invalid option: expected one of "RN"|"LPN"|"CNA"`), not the "readable message" Arch §8.1 (`ARCHITECTURE.md:824`) promises; (c) `CNA` is allowed but the design copy says "RN or LPN"; (d) description/pay rate are stripped (see 1d).

---

## 3. Findings

### F-1 Missing endpoints (detail in §4)
13 Arch §8.4 routes are missing (`ARCHITECTURE.md:885-900`): `PATCH /api/me/profile`, `POST /api/me/avatar`, `GET /api/shifts/:id/details`, `GET/PATCH /api/agencies/:id`, `GET/POST /api/nurses/me/credentials`, `GET /api/credentials/:id/download-url`, `PATCH /api/credentials/:id/review`, `GET /api/admin/credentials`, `GET /api/admin/coverage`, `GET/POST /api/facilities`, `DELETE /api/shifts/:id`. There is no timesheet route anywhere (none defined in Arch).

### F-2 Implemented but not connected to the UI
`GET /api/shifts` (plain and `?matchable=true`), `POST /api/shifts`, `POST /api/shifts/:id/claim`, `POST /api/shifts/:id/cancel`, `POST /api/shifts/:id/withdraw`, `GET /api/nurses/me/shifts`, `GET /api/audit-logs`. The agency shifts page fetches but renders only a count (`agency/shifts/page.tsx:46-48`, test id `agency-shift-count`), with no `shift-list-item`.
Consequence: **11 of 15 required test IDs are absent** from `apps/web/src`. Present: `login-email-input`, `login-password-input`, `login-submit-button` (`features/auth/login-form.tsx:67,91,113`) and `notification-banner` (`components/ui/NotificationBanner.tsx:33`). Missing: `shift-list-item`, `shift-claim-button`, `shift-cancel-button`, `credential-upload-input`, `credential-expiry-date-input`, `agency-post-shift-button`, `agency-post-shift-submit-button`, `admin-dashboard-shift-table`, `admin-shift-status-badge`, `audit-log-table`, `timesheet-table`. Only the 2 credential IDs need a new endpoint. The other 9 need only UI on existing routes.

### F-3 Frontend requests with no backend route
None.

### F-4 Incorrect methods
None. All verbs match Spec/Arch. `api-client.ts:125` defaults to POST when a body is present, GET otherwise; claim/withdraw callers must pass `method:"POST"` explicitly (no body).

### F-5 Request-format issues
- Login: a malformed body (missing email, non-string) returns **401** `Invalid email or password` (`auth/routes.ts:68-73`). Arch lists 400 (`ARCHITECTURE.md:850`). This is deliberate (no oracle) but Arch is stale. Only invalid JSON gets 400.
- `POST /api/shifts` strips `description` / `payRate` that the design form collects. The DB columns exist (`shifts.description`, `payRateCents`), so the contract needs extending: `description: z.string().max(500).optional()`, `payRateCents: z.number().int().positive().max(100000).optional()` (request only; the response Shift shape stays frozen).
- `GET /api/shifts` ignores unknown query keys (`ListShiftsQuery` is non-strict, `contracts:76`), so `?status=open` silently returns everything. Acceptable per Arch §8.1 (required routes unfiltered), but the admin dashboard must filter client-side or use coverage.
- Agency path built without `encodeURIComponent` (`agency/shifts/page.tsx:17`). Low risk.

### F-6 Error ordering / error handling
- **Cancel validates the body before authorizing.** `shifts/service.ts:186-193`: 404 (no shift) -> 400 (bad/missing `reason`) -> 403. A nurse or foreign agency sending `{}` gets 400, not 403. That is inconsistent with create and audit, which put authz first (`service:49-53`, `audit/routes.ts:12-15`). Board item "Cancel: authorize before body validation (403 before 400) · Later" (`brain/Tasks.md:57`). It cannot simply be reordered, because the nurse rule depends on `reason`: authorize with role/ownership first, and evaluate the `advance` rule after parsing.
- **Cancel leaks existence where withdraw/claim hide it.** A foreign agency or another network's admin gets 403 on an existing shift and 404 on a missing one (`service:187,193`), while withdraw maps those cases to 404 (`service:141-145`) and claim does too (`service:108-109`).
- Empty JSON body: handled globally (`app.ts:57-63`, board item ticked `brain/Tasks.md:56`). Claim ignores the body; cancel with an empty body -> `body ?? {}` -> 400 `reason` issue.
- Generic 4xx messages: audit `Invalid query` (`audit/routes.ts:15`, `service:66,70`), shifts `Invalid query` (`shifts/routes:23`). Fine for security, not very readable.
- Denial mapping `out_of_scope` -> 404 body `"Not found"` (`authz/decision.ts:20`), while shift routes use `"Shift not found"`. Two texts for the same situation. Cosmetic.

### F-7 Response-shape consistency (`{ error: string }`)
Compliant. All handler error paths send `{error}` (grep of `.send(`/`reply.code(` in `apps/api/src`: only `auth/routes.ts:73,87` (constant `{error}` objects) and logout 204 empty). Not-found handler `app.ts:86`; global error handler `app.ts:87-91` maps every thrown error, including Fastify's own 400 bad JSON / 413 / 415, to `{error}` with a generic 5xx message. Rate-limit 429 is custom `{error}` (`auth/routes.ts:33-34`). Response bodies are `strictObject`-parsed, so no extra keys leak.

### F-8 Missing authN / authZ
- None on implemented routes. Every non-auth, non-health route carries `authenticate + loadActor`, and a test enforces this (`authz/authz.test.ts:67-68`).
- Note: `GET /api/shifts` exposes `claimedBy` nurse ids to every role (accepted, `ARCHITECTURE.md:1296` Q3).
- Note: `GET /api/agencies/:id/shifts` admin access is limited to the admin's own network (`policy:26-27`). That is stricter than Arch §7.2 "admin -> 200" (`ARCHITECTURE.md:797-800`) and fine for the seed.

### F-9 Pagination / filtering vs docs
- `GET /api/audit-logs`: cursor paging implemented (`audit/service.ts:65-86`, `limit` 1-100 default 50, opaque base64url keyset, `nextCursor` null at the end) and filters `entityType, entityId, action, from, to`. That matches Arch (`ARCHITECTURE.md:899`). The design (`Admin-Audit`) also wants a role filter (`actorRole`), free-text search, actor display names, item labels and a total count/page numbers. None exist; `AuditLogEntry` is strict (`contracts:146-158`), so additions need a contract change.
- Audit action vocabulary differs from the design: the code writes `shift.created/claimed/cancelled/withdrawn`, `auth.login/login_failed/logout/refresh_reuse_detected`. The design shows `shift.posted`, `shift.claim_blocked`, `credential.uploaded/verified`. A refused claim writes **no** audit row (`shifts/service:100-101`), so "Claim blocked" cannot be shown.
- Shift filters (`?status&from&to&agencyId`, `ARCHITECTURE.md:841`) apply to "additional list routes". No additional shift list route exists yet (coverage missing).

### F-10 Hardcoded / mock data in the frontend
- `apps/web/src`: no mock datasets. Pages are static `EmptyState` copy (e.g. `admin/dashboard/page.tsx:17-19`). The nurse profile shows store data only.
- `apps/web/e2e/mock-api.ts` mocks the API via `page.route` and **drifts from real behaviour**: agency shifts return 403 `Agency not available` when `X-Agency-Id !== :agencyId` or on non-membership (`mock-api.ts:141-143`), but the real API returns `Forbidden` for non-members and does not require header == path. Mock agency-a returns 1 synthetic shift (`shift-agency-a-0`) vs 2 seeded. Fine for UI tests, but Playwright never checks the real contract (Status "Next step 2" already plans this).

### F-11 Docs / Postman
- Postman is current: `pnpm --filter api exec tsx ../../.claude/skills/postman-export/scripts/export.mjs --check` -> `checked 3 files ... 17 requests (7 extra routes) OK`. 13 routes: 6 spec + refresh, logout, me, withdraw, nurses/me/shifts, audit-logs, health. `?matchable=true` is not a separate request (same route).
- Stale Arch: health "database check" (`:901`); login 400 (`:850`); §16.2 step 4 "withdraw pending" (`:1193`) but withdraw is built.

---

## 4. Missing endpoints: contract sketches

Conventions: Bearer + `loadActor`; errors `{error}`; additive lists `{items, nextCursor}` (Arch §8.1); ids match `Id`; hidden resources -> 404.

| # | Endpoint | Purpose / consumer | Request (zod-ish) | Response (zod-ish) | Permissions | Priority |
|---|---|---|---|---|---|---|
| M1 | `POST /api/nurses/me/credentials` | Upload license/TB/other. `Nurse-Credentials` form; carries `credential-upload-input`, `credential-expiry-date-input` | multipart: `file` (<=10 MB -> 413, sniffed pdf/jpg/png/heic -> 415), `type: enum(license,tb_screening,other)`, `expiresOn: IsoDate` (required if license), `issuedOn?`, `number?`, `issuingState?`, `screenedOn?` (required if TB), `tbTestType?` | 201 `Credential = strict{id, type, status:"pending", expiresOn: IsoDate.nullable(), screenedOn: IsoDate.nullable(), uploadedAt: IsoInstant, reviewNote: null}`. Never the file key | nurse role, own record only; audit `credential.uploaded`; private bucket, PII-free key | **P0** (spec: "build that route however makes sense"; test IDs sit on its form) |
| M2 | `GET /api/nurses/me/credentials` | List + lapsed-license fallback (Arch §12.4). `Nurse-Credentials`, `Nurse-License-Lapsed` | none | 200 `{ items: Credential[] }` with `status: pending/verified/rejected` and derived `expired: boolean`, `reviewNote: string \| null` | nurse, own | **P1** (P0 if the nurse-2 fallback follows §12.4 literally. Cheaper fallback with no new route: matchable empty -> `GET /api/shifts` filtered to `open`) |
| M3 | `GET /api/admin/coverage?from&to&agencyId&status` | Dashboard counts + table with nurse names. `Admin-Dashboard` | query `{from?: IsoDate, to?: IsoDate, agencyId?: Id, status?: ShiftStatus}` | 200 `{counts: {open, filled, cancelled, completed, byAgency: [{agencyId, name, open, filled, cancelled}]}, shifts: (Shift & {claimedByName: string\|null})[]}` | admin, own network(s) | **P1** (`admin-dashboard-shift-table`/badge can render from `GET /api/shifts` today) |
| M4 | `GET /api/admin/credentials?status=pending&cursor&limit` | Review queue + sidebar count. `Admin-Credentials` | `{status?: enum, cursor?, limit?}` | 200 `{items: (Credential & {nurseId, nurseName})[], nextCursor}` | admin of the nurse's network | P1 |
| M5 | `PATCH /api/credentials/:id/review` | Verify/reject. `Admin-Credentials`, `Admin-Doc-Preview` | `{status: enum(verified,rejected), note: string.min(1).max(500)}` (note required on reject) | 200 Credential | admin of network; 404 out of scope; 409 if not pending; audit `credential.verified/rejected` | P1 |
| M6 | `GET /api/credentials/:id/download-url` | Secure 5-min preview. `Admin-Doc-Preview` | none | 200 `{url, expiresAt: IsoInstant}` | owner nurse; network admin; agency owner/manager only while the nurse holds one of its shifts (`credentials/policy.ts`); 404 hidden; audited | P1 |
| M7 | `GET /api/shifts/:id/details` | Shift detail sheet. `Nurse-Detail-Claim` | params `ShiftIdParams` | 200 `Shift & {facility: {id,name,city,state}\|null, description: string\|null, payRateCents: int\|null, agencyContact: {phone\|null, email\|null}}` | any authenticated; 404 unknown/deleted | P1 (needs a street-address column if the design's address line is kept) |
| M8 | `GET /api/agencies/:id` | Public agency details. `Agency-Profile`, detail contact | params `AgencyIdParams` | 200 `{agencyId, name, email\|null, phone\|null, city\|null, state\|null, logoUrl\|null}` | any authenticated (Arch §8.3) | P2 |
| M9 | `PATCH /api/agencies/:id` | Edit profile. `Agency-Profile` | `{name?, email?, phone?, city?, state?, postalCode?}` (strip others) | 200 as M8 | owner/manager of that agency (`agencyWrite`) or network admin; audit | P2 |
| M10 | `GET /api/facilities` (+ `POST` admin) | Facility picker on post form. `Agency-Post-Shift` | GET none; POST `{name, city, state, postalCode, timezone}` | GET `{items: [{id, name, city, state, timezone}]}` | GET any authenticated in network; POST admin | P2 (`facilityId` is already accepted on create) |
| M11 | `PATCH /api/me/profile`, `POST /api/me/avatar` | Self profile edit. `Nurse-Profile` | `{name?, phone?}`; multipart image | `MeResponse` | self | P2 |
| M12 | `DELETE /api/shifts/:id` | Admin soft delete | none | 204 | network admin; audit | P2 |
| M13 | Timesheets (no Arch route) | `Admin-Timesheets` (`timesheet-table`) | — | — | — | **No endpoint for MVP.** The design's state is an empty table: render `timesheet-table` with headers + empty row (or rows derived from `GET /api/shifts` where `status in (filled, completed)`). A real `GET /api/admin/timesheets` needs the [Future] `timesheets` table (`ARCHITECTURE.md:539`): P2 |
| M14 | Contract extensions (not new routes) | `Agency-Post-Shift`, `Admin-Audit` | `CreateShiftRequest += description?, payRateCents?`; `AuditLogQuery += actorRole?`; `AuditLogEntry += actorName, entityLabel` | — | unchanged | P1 |

**Does anything block a mandatory test ID?** Only M1 (credential upload inputs need a working form behind them). The other 9 missing IDs are blocked only by frontend work on routes that already exist.
