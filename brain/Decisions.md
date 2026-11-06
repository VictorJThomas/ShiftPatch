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
- **For the handler stage:** (1) Fastify rejects `Content-Type: application/json` + empty body (`FST_ERR_CTP_EMPTY_JSON_BODY`) before Zod → web client must send `{}` or no content-type on claim, or add a tolerant parser, and map it to `{error}` shape. (2) A malformed login body gives 400 (validation), not 401; consider mapping login validation failures to the 401 text. Both open.
