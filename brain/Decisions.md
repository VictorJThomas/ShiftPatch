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
