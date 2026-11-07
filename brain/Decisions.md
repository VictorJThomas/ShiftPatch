# Decisions (digest of [[docs/ARCHITECTURE]], status: approved, no code yet)

Full tables + reasoning in ARCHITECTURE. Section refs below = its `§N`.

## Stack (§3)
TypeScript strict · pnpm monorepo · Next.js App Router (Vercel) · Fastify 5 + Zod · PostgreSQL 16 + Drizzle · Railway (API+DB) · Cloudflare R2 (MinIO local) · Resend (Mailpit local) · argon2id · `jose` JWT · Zustand + TanStack Query · Vitest + Fastify `inject` + Playwright.
Vercel rewrites `/api/*` → Railway API: one public origin, no CORS (C1).

## Principles (§1)
Contract mappers keep spec shapes exact (extra data → separate endpoints) · server decides all rules · Postgres guarantees integrity (atomic claim via `UPDATE … WHERE status='open'`) · all shift changes go through `ShiftService` (audit + outbox same tx) · no queue/Redis/WebSockets in MVP.

## Key conflict resolutions (§2)
- C4 agency login = user with id `agency-a`/`agency-b`, member of same-id agency.
- C5 optional `X-Agency-Id` header for multi-membership users.
- C6 nurses = shared network roster, claim across all agencies.
- C8 claim blocked if no license that is unexpired and not rejected (**pending counts as OK**); 403 text exact for expired, other text for none (§5.3).
- C9 `cancel` = filled→open + history row; `cancelled` status = agency `POST /api/shifts/:id/withdraw`.
- C10 overnight: `end < start` → next day; store local, no tz conversion.
- C11 cancel allowed by claiming nurse (advance only), owning agency, admin; emails sent.
- C12 `GET /api/shifts` stays full list; nurse UI uses `?matchable=true`.

## Auth (§6)
Access JWT 15 min, in memory only (Zustand). Refresh = httpOnly SameSite=Strict cookie, rotated, reuse detection revokes family. Login body stays exactly `{token,user}`.

## Data (§4)
Text PKs (`shift-<seq>`, `usr_<uuidv7>`…), soft delete via `deleted_at`, append-only `audit_log`, credentials private bucket + 5-min signed links, no clinical TB results stored.

## Escalation
Bulk one-click license/TB export **not built as asked**. Recommended: staged Option D (summary report → scoped, audited, expiring package). Needs founder decision. See [[ESCALATION]].

## Build order (§16.2)
1 monorepo+CI+health deploy → 2 schema/seed → 3 contracts+auth → 4 shifts → 5 audit+outbox+emails → 6 web app + test IDs → 7 credentials/files → 8 Playwright+security+prod deploy → 9 extras.
Done = `pnpm typecheck && pnpm lint && pnpm test` green locally + CI, deploy green.

## Open questions (§19)
Q1 agency id = agency id? · Q2 grader sees ineligible shifts to trigger 403? (fallback: lapsed nurse sees open shifts + renewal warning) · Q3 hide `claimedBy`? (no) · Q4 FL TB/HIPAA/retention legal review · Q5 inspection export.

## Design system (2026-11-06)
- Font: Schibsted Grotesk (single family). Brand teal `#0E5A55`, patch amber `#F2B544` (mark only). Paper bg `#F5F4EF`.
- Mark: two overlapping rounded tiles (shift + patch). No medical clichés.
- Status = icon + label + tint (never color alone); Expired uses hatch + heavier outline. Tokens: `docs/design/tokens.css`.
- Agency identity: full-width colored band under header (Sunrise `#A24A00`, Metro `#2F4FA3`) with "Active agency" label.
- Touch target 44px (`--tap`); 36px compact only on desktop tables.
- Placeholder data invented for design only: facility "Med-Surg Unit 4W", address 1200 Palm Avenue Tampa, pay $48/hr, agency emails `*.example`. Not part of spec seed data.

- 2026-11-06: `--c-on-brand` (text on teal buttons) changed from #FFFFFF to #E8EFEC (~7:1 on #0E5A55). Updated tokens.css + brand sheet.

## Agentic workflow (2026-11-06)
- Project skills in `.claude/skills/`: `/task` (status change in Tasks.md + Notion in one step, script `task/scripts/tasks_md.py`), `/verify` (gates, script `verify/scripts/verify.mjs`), `/wrap-session` (brain update + board reconcile). Why: the two-place manual edit drifted on day 1.
- Root `package.json` script names are fixed by `/verify`: `typecheck`, `lint`, `test` (unit + integration), `test:contract` (6 required routes, needs Postgres). Gates run sequentially (memory-constrained machine).
- Tasks.md is edited first (script keeps CRLF, exact titles), Notion second. Reconcile: local ahead → push; Notion ahead → pull; status regression → ask Victor.

## Foundation (2026-11-06)
- Toolchain: TypeScript 6.0 (not 7: typescript-eslint 8.72 supports <6.1), Next 16, Fastify 5, Vitest 5, zod 4, ESLint 10 flat config. Node 22 (`.nvmrc`).
- Local S3 = Chainguard `minio` + `minio-client` (`:latest`, free tier). Why: official `minio/minio` + `minio/mc` images no longer published. Distroless → no healthcheck; init services retry.
- Railway: Hobby plan (trial expired). Railpack builder + root `railway.json`; root `start` script required (Railpack ignores `deploy.startCommand` when planning). Deploys manual via `railway up` until GitHub source is connected. Config-as-code flagged deprecated by CLI (works until 2026-12-01).
- Vercel project `shiftpatch-web`, Root Directory `apps/web`, source outside root enabled (root lockfile). `API_ORIGIN` = Railway origin, set in production env (build-time rewrite).
- CI uses `gitleaks/gitleaks-action@v3` (v2 runs on Node 20, removed from runners 2026-09-16); no license needed on personal account.
- Orchestration: foundation built by Sonnet subagents with assigned skills; orchestrator alone commits and touches the board.

## Data layer (2026-11-06, stage 2)
- Drizzle `casing: "snake_case"` (client + `drizzle.config.ts`): TS keys camelCase, columns snake_case. Schema split by domain in `apps/api/src/db/schema/` (`_common`, `identity`, `shifts`, `credentials`, `system`). Migrations in `apps/api/src/db/migrations/` (`0000_init` generated, `0001_audit_log_append_only` custom SQL).
- `shift_id_seq` starts at **4** (after seeds). The spec's `shift-7` is only an illustrative response, not a requirement; contract tests must not assert it.
- Multi-agency isolation in the DB: composite FK `shifts(network_id, agency_id) -> network_agencies(network_id, agency_id)`. Partial unique indexes enforce one active membership per user+agency and case-insensitive email among non-deleted users.
- `audit_log` append-only via trigger on UPDATE/DELETE and TRUNCATE (fires for the table owner too). INSERT/SELECT-only role grant deferred to deploy time (Stage 8); local dev uses one owner role.
- Seed: `seed(db)` in `src/db/seed.ts`, one transaction, `ON CONFLICT DO NOTHING` everywhere (never overwrites, never lowers the sequence). Agency login users have ids `agency-a`/`agency-b` (ARCHITECTURE §4.6). Production reseed to exact spec values is a Stage 8 task and needs an explicit reset path.
- DB tests create and drop a throwaway database per test file (`test-db.ts`, needs Postgres at `localhost:5432` with the compose creds; CI service matches). Never run against the dev DB.
- Not built (documented as Future): nurse claim overlap exclusion (`tstzrange`), `timesheets`.
- Review fixes (migration `0002`): nurse<->status CHECK is `claimed_by IS NOT NULL <=> status IN (filled, completed)` (the original §4.4 rule made `completed` unreachable; doc corrected). Composite FKs make a shift's nurse and facility belong to the shift's network. Audit triggers are `ENABLE ALWAYS` (fire under `session_replication_role=replica`). Non-blank CHECKs on names/email.
- **Open item (deploy, Stage 8):** the append-only guarantee only holds against a non-owner, non-superuser role. Dev/CI role `shiftpatch` is a superuser. Before prod: create an `app` role with INSERT/SELECT on `audit_log`, no TRUNCATE; app connects as it, migrations as the owner.
- Seed never overwrites existing rows (`ON CONFLICT DO NOTHING`): a drifted DB stays drifted. Production reseed (Stage 8) needs an explicit reset path.

## Contracts (2026-11-06, stage 3)
- `packages/contracts/src/index.ts`, one file, HTTP-only (no DB/domain imports). Why one file: no relative imports means no `.js`-extension trap under api's NodeNext. **If you split it, relative imports must end in `.js`.**
- Strictness: **requests** (`body`, `params`) = `z.object` → unknown keys **stripped** (ARCHITECTURE security row; e.g. a body `agencyId` on POST /api/shifts is dropped, agency comes from the token). **Responses** = `z.strictObject` → extra key fails (ARCHITECTURE testing row "exact keys"). `.extend` keeps strictness (tested).
- Per-route response literals: Create = `open`/`claimedBy:null`; Claim = `filled`/string; Cancel = `open`/null + strict `cancellation {reason, previousNurseId}` (previousNurseId never null: cancel of an open shift is 409, §5.1).
- Primitives: date `z.iso.date()` (calendar-valid), time `z.iso.time({precision:-1})` = `HH:MM` only (mappers must drop Postgres seconds), `Id` = `/^[A-Za-z0-9_-]{1,64}$/`, `ShiftRole` RN/LPN/CNA + `ShiftStatus` open/filled/cancelled/completed (= DB), login `z.email().max(254)` + password max 256 (bounds argon2 work).
- `ErrorMessage` constants: spec texts (`Invalid email or password`, `Credential expired, cannot claim shift`) + ARCHITECTURE texts (`No valid credential on file, cannot claim shift`, `Unauthorized`, `Forbidden`). No invented 404/409 texts.
- Packaging: `exports {types: src, development: src, default: dist}`. Dev/test read TS source (vitest auto `development`; api `dev` = `tsx watch --conditions=development`; Next `transpilePackages`). Prod reads `dist` (built by `pnpm -r build` topologically, Railway `pnpm --filter api... build`; web `build` script builds contracts first because Vercel runs only `apps/web`). CI now runs `pnpm build`.
- `apps/api/src/contracts.test.ts` = permanent consumer probe (NodeNext typecheck + vitest resolution).
- **Contract gate (`pnpm test:contract`):** api `vitest.contract.config.ts` runs `src/**/*.contract.test.ts` only; `pnpm test` excludes them (`vitest.config.ts`). Suite `src/contract/required-routes.contract.test.ts`: one throwaway DB (migrate + seed), Fastify `inject`, tokens via the real login route, strict contract parse + exact error texts, runs in file order (reads, then writes). Each route block is `describe.skipIf(!app.hasRoute(...))`, so the gate goes live per route as handlers land and is never red before. Handlers must read the DB from `DATABASE_URL` (the harness sets it before `buildApp()`), or change the harness. CI runs it after `pnpm test`.
- **Postman (`/postman-export` skill):** `docs/postman/` is generated + committed (collection + local/prod envs), never hand-edited. Schemas = `z.toJSONSchema(..., {target: "draft-7"})` (Postman's Ajv); routes = `app.printRoutes()`; `--check` detects staleness. Why: graders/founder can try the API without reading code, and it can't drift from the contracts. Regenerate with any route/schema change.
- **For the handler stage:** (1) [still open] Fastify rejects `Content-Type: application/json` + empty body (`FST_ERR_CTP_EMPTY_JSON_BODY`) before Zod → web client must send `{}` or no content-type on claim, or add a tolerant parser, and map it to `{error}` shape. (2) A malformed login body gives 400 (validation), not 401; consider mapping login validation failures to the 401 text. Both open.

## Auth lifecycle (2026-11-06, stage 3)
- Layout per ARCHITECTURE §16.1: `apps/api/src/modules/auth/{tokens,service,routes}.ts`, `modules/audit/audit.ts` (`recordAudit(dbOrTx, entry)`, pass the tx of the change). No separate repo file yet (YAGNI).
- **Access JWT:** HS256 via `jose`, claims `sub`,`role`,`jti` (+`iat`,`exp`), 15 min. `verifyAccessToken()` pins `algorithms:["HS256"]`, validates role via contracts `UserRole`. `JWT_SECRET` (>=32 bytes) is checked **per call, not at boot**, so `/api/health` survives a deploy missing it (auth returns 500). Test secret lives in the vitest configs `test.env`.
- **Refresh token:** `randomBytes(32)` base64url, only SHA-256 stored (`refresh_tokens.token_hash`). Ids `rt_<uuid>`, family `rtf_<uuid>`. 7-day sliding expiry (every rotation = new 7 days, no absolute family cap yet).
- **Rotation:** every family write (rotate, reuse revoke, logout) takes `pg_advisory_xact_lock(hashtext(family_id))` then re-reads the row. Why not just `FOR UPDATE` on the row: a revoke's UPDATE snapshot misses a successor inserted by a concurrent rotation → live token after logout/reuse (review I1; test `logout racing a refresh`). Winner inserts successor, sets old `revoked_at` + `replaced_by`. Rotated token presented again: within **10 s grace** and family still has a live token = concurrent refresh → **409**, no new token, cookie untouched (winner's Set-Cookie stands); grace but family dead → 401; after 10 s = **reuse** → revoke whole family + audit `auth.refresh_reuse_detected` (once, only if rows revoked) → 401. Expired / logged-out / user suspended or deleted → 401 + cookie cleared (suspended/deleted also revokes family).
- **Cookie** `sp_refresh`: httpOnly, SameSite=Strict, Path=/api/auth, Max-Age 7d, Secure when `NODE_ENV=production` or `COOKIE_SECURE=true`. Cleared with the same attributes.
- **Origin check** (refresh, logout): Origin must equal `APP_ORIGIN` (default `http://localhost:3000`) → else 403 `Forbidden`. Missing Origin allowed (non-browser clients can't ride a victim cookie; browsers always send Origin on POST). Login is not origin-checked.
- **Login:** `JWT_SECRET` asserted before any DB write (login and refresh), so a misconfig can't commit a rotation then fail. Email trim+lowercase before Zod; **malformed body → same 401 "Invalid email or password"** (closes open item (2) above). Unknown email → argon2 verify against a dummy argon2id hash (same params as seed). Suspended/deleted → verify still runs, then 401. Failed attempts audited `auth.login_failed` with `emailSha256` only. Success: refresh row + `last_login_at` + `auth.login` audit in one tx.
- **Logout:** 204 always; revokes family if cookie known; audits `auth.logout` only when it actually revoked rows (repeat calls = no-op).
- **Rate limits** (`@fastify/rate-limit`, `global:false`, in-memory LRU `cache: 50_000`, 1 min window): login **10 failures**/IP and /email (gate = read without increment, failures increment; successes never count, so a shared hospital NAT isn't throttled). Email key = SHA-256 of a Zod-valid email, else IP (bounded keys: junk bodies can't bloat or evict counters — review C1). Accepted trade-off: anyone can lock a known email out for 1 min with 10 bad attempts. Refresh+logout 30 req/IP. Uses `app.createRateLimit` + own preHandler, because `app.rateLimit()` handlers share a per-request "ran" flag (a 2nd one silently skips). 429 body `{error:"Too many requests, try again later"}` + `retry-after`. Ceiling: per-instance memory → Redis store if >1 replica.
- **Client IP:** `TRUST_PROXY` = hop count (prod: Vercel + Railway edge = 2, verify on deploy). Ceiling: callers hitting the Railway domain directly can spoof X-Forwarded-For; the per-email bucket doesn't depend on IP.
- DB client in `buildApp()` is lazy (`DATABASE_URL` read on first use, closed `onClose`).

## Authorization (2026-11-06, stage 3)
- Code: `apps/api/src/modules/authz/{actor,plugin,decision,can,scope}.ts`, `policy.ts` per module (shifts, memberships, audit, credentials, admin), `modules/{shifts,audit}/repository.ts`. Full behavior: ARCHITECTURE §7.2 "As built".
- **Hooks in `onRequest`** (not preHandler) so 401 beats 400. Decorators registered with the skip-override symbol (= fastify-plugin, no new dep). Routes opt in: `{ onRequest: [app.authenticate, app.loadActor] }`; handlers use `req.actor`, `can()`, `sendDenial()`.
- **Stale session = JWT `role` ≠ DB role → 401.** Access tokens have no family id, so logout doesn't revoke a live access token (≤15 min; accepted, ARCHITECTURE §6.2). Fix would need a claim/storage change.
- **Memberships load only for the matching global role** (agency→agency memberships, admin→network memberships). Stray rows on a nurse/admin are ignored: one primary role in MVP.
- **X-Agency-Id invalid → 403 everywhere**, even reads and for nurses/admins. Multi-agency users need an explicit selection for writes (400 `Select an agency` via `agency_selection_required`); reads by path param (`:agencyId`) don't need it.
- **Interpretation calls (not in the matrix):** `audit:read` and credential reads exclude `viewer`; `membership:read` owner-only (+ admin in network); admin can manage/cancel in-network but not create shifts (no agency); agency credential access uses the *active* agency.
- **Scopes:** branded types + WeakSet; empty `agencyIds` can't be issued (`agencyScope` always has one id), `inArray` on `[]` is false anyway.
- Probe routes in `authz.test.ts` stand in for Stage 4 handlers; no real route is protected yet.
- **Review fixes (agent-skills:code-reviewer, no Critical):** `agencyWrite` checks explicit-target membership before asking to "select" (403 not 400); credential reads for agencies need no selection (header only narrows); `agencyScopeForAdmin(actor, agencyId, agencyNetworkId)` gives admins the single-agency scope (network id from the DB row, never the client); `JwtConfigError` class replaces the message-prefix match (500 test added); route-collector test asserts every future `/api/*` route (except health + `/api/auth/*`) carries both hooks.
- **Accepted / documented:** (a) `agencyScope` proves membership, not `can()`: handlers must run `can()` first (comment on `AgencyScope`). (b) Stray `X-Agency-Id` from a nurse/admin stays 403 (brief: reject an agency the user doesn't belong to); frontend must not send it for them. (c) `authenticate` and `loadActor` are two queries (ms-wide TOCTOU; effect = one in-flight request after a suspension, the next is 401). (d) Resource shapes (`networkId`, `agencyIdsHoldingNurse`) must be loaded from the DB by the service, never from the request.

## Shift listing + creation (2026-11-06, stage 4a)
- Code: `apps/api/src/modules/shifts/{routes,service,repository,mappers,eligibility,policy}.ts`; `MarketplaceScope` in `authz/scope.ts`. Chain: route (thin) -> `service.ts` plain functions (no class) -> scoped `repository.ts` -> `toShift` mapper -> strict contract `.parse`.
- **Route 6 returns the full Shift per item** (Victor's call). Spec prose says "same shape as above", its JSON examples show only `{id,status,claimedBy}`; ARCHITECTURE §8.2 + contract + contract test use the full shape (superset of the examples).
- **Optional `facilityId` on `POST /api/shifts`** (additive; spec's 4 fields unchanged). Facility must be active and in the agency's network, else 400 `Facility not found in this network` (DB composite FK is the backstop). Timezone = facility's, else the network `default_timezone`. Response shape unchanged. `start == end` -> 400 (mirrors the DB CHECK).
- **Authz before validation on create**: `can("shift:create")` runs first, so a viewer with a bad body gets 403, a multi-agency user without `X-Agency-Id` gets 400 `Select an agency`. Agency user with **no active membership** (e.g. revoked) = 403 `not_a_member`, not "Select an agency" (policy fix + test).
- **`MarketplaceScope`**: the cross-agency read is spec-mandated for every role, but still goes through a branded/WeakSet scope (`marketplaceScope(actor)` any actor, `matchableScope(actor)` nurse + own network) so no unscoped shift query exists.
- **`shift:list-matchable`** policy action: nurse with a roster network only; others 403. `?matchable=false` = plain marketplace; any other value 400.
- **Matchable = open + same network + `isEligible` + license-type match only when `nurse_profiles.license_type` is set.** `isEligible(licenses, {shiftDate}, today)` is pure, in `eligibility.ts` (claim reuses it); `today` is in the shift's timezone. Filter runs in memory after the SQL (ponytail: SQL EXISTS if volume grows). Marketplace default is unchanged.
- **Unknown agency on route 6 = same 403 as a foreign agency** (no existence leak; admins too). Malformed `:agencyId` = 403.
- Seed nurse-1's license expires 2027-01-01: HTTP tests use their own far-future nurses so the suite never ages out.
- **Review (agent-skills:code-reviewer, no Critical) fixes:** list ordering `length(id), id` (no bigint cast a stray id could break); `todayIn` formatter memoised; service-level eligibility test with a fixed clock (shift timezone, inclusive expiry day); POST tests no longer depend on sibling-test state or exact ids.
- **Accepted / documented from review:** (a) stale/non-member `X-Agency-Id` is 403 on every route incl. `GET /api/shifts` (actor.ts, Stage 3 decision): frontend must drop the header when the membership is gone; test added. (b) `network_agencies` PK allows an agency in several networks; the MVP assumes ONE network per agency (`agencyNetworkId` is `limit 1`). Revisit with a unique index on `agency_id` or an explicit network param before multi-network. (c) members of a suspended-approval agency get 403 on their own shifts (agencyNetworkId null). (d) matchable includes past open shifts (spec: eligible for the shift's date). (e) malformed JSON from a viewer gets Fastify's 400 before authz (no data leaked). (f) in-memory matchable filter + 3 queries: fine at MVP scale.
- **Local run + logging:** `server.ts` is the only place the Fastify logger is on (`buildApp({ logger: true })`); tests build with it off. Error handler logs every 5xx with stack via `req.log.error`; response body stays generic. `dev` and `start:local` pass `--env-file=../../.env` (Node never loads `.env` itself); `start:local` builds first so `dist/` is never stale. Why: a bare Postman 500 with a silent terminal hid a missing `JWT_SECRET`.

## Shift claim + cancel (2026-11-06, stage 4b)
- Code: `claimShift` / `cancelShift` in `modules/shifts/service.ts` (plain functions; "ShiftService"), SQL in `repository.ts`, routes in `routes.ts`. Full flow: ARCHITECTURE §5.4 "As built".
- **Claim** = one tx: shift -> `can("shift:claim")` -> `SELECT licenses FOR SHARE` -> `ineligibility()` -> `UPDATE … WHERE status='open' AND deleted_at IS NULL AND network_id=? RETURNING` (0 rows = 409) -> audit. Concurrency proven on real Postgres: 20 claims = 1x200 + 19x409, one audit row. The `FOR SHARE` is proven by a test that holds an uncommitted license UPDATE; removing the lock or the `status='open'` guard turns tests red (mutation-checked).
- **Cancel** = one tx, shift row `FOR UPDATE` (cancel x cancel serializes; previous nurse read from the locked row). Writes shift, `shift_cancellations`, audit, outbox in the same tx; rollback proven with real triggers that raise on `audit_log` / `notifications` inserts.
- Texts added to contracts `ErrorMessage` (from §5.1/§5.2): `Shift not found` (404), `Shift is no longer open` (409 claim), `Shift is not filled` (409 cancel).
- Calls made: out-of-network nurse = 404 (same as missing, no leak); cancel check order = 404 -> body 400 -> authz 403 -> state 409 (a non-claimer nurse gets 403 even on an open shift); `isEligible` ignores soft-deleted rows itself; expired vs none: any non-deleted non-rejected license => `expired`, else `none`.
- **Open / risks:** withdraw (`open -> cancelled`) not built; emails need the Stage 5 dispatcher (outbox rows already written); Fastify 400 on `Content-Type: application/json` + empty body for claim (no tolerant parser yet); no nurse overlap exclusion (Future); a license rejected after a claim does not unassign (§5.3). Reviewer findings: see Session-Log once the review lands.
