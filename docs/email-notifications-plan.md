# Email Notifications v2 Plan

Branch: `feature/14-email-notifications`. Written 2026-11-10.

## Goal
Founder wish list item "Email notifications". Today the API sends exactly one email: `shift.cancelled` (ARCHITECTURE §10, decision C11). The plumbing is finished and does not change:
- outbox table `notifications` (`apps/api/src/db/schema/system.ts:46`); rows are inserted in the same transaction as the business change;
- dispatcher `apps/api/src/modules/notifications/dispatcher.ts` (lease claim, `FOR UPDATE SKIP LOCKED`, backoff 30 s→240 s, `MAX_ATTEMPTS` 5), started in `apps/api/src/server.ts`;
- transports in `mail.ts`: `log` (default), `smtp` (Mailpit), `resend`, plus `EMAIL_REDIRECT_TO`;
- template registry in `templates.ts` (whitelisted payload fields, HTML-escaped, `PermanentMailError` for rows that can never succeed).

This plan adds 6 event-driven emails and 5 time-based reminders, so each role (nurse, agency, admin) gets email for the actions that concern them. Event emails get new templates and hooks in existing services. Reminders need a new periodic sweep with idempotent inserts.

## Constraints
- Outbox pattern only: event rows are inserted inside the business tx. If the outbox insert fails, the action rolls back.
- **Emails never contain credential details or health data.** No credential type (license vs TB), no TB result, no file names. Expiry dates go only to the owning nurse. Emails never contain links that carry tokens. A plain `APP_ORIGIN` URL is OK.
- The actor never gets an email about their own action. **Only exception:** the claim confirmation to the claiming nurse (E3).
- Recipients are users with `users.status='active'` and `deleted_at IS NULL`. Agency recipients are active (`revoked_at IS NULL`) memberships with role `owner` or `manager`. `viewer` gets nothing. Admin recipients are active `network_memberships` rows of the relevant network.
- Withdraw (`open→cancelled`) sends no email: an open shift has no nurse (existing decision).
- New-shift email (E1) goes **only to eligible nurses**: the license type matches the role (`roleMatchesLicense`) and the license is valid on the shift date (`isEligible`).
- The user chose these scheduled reminders: credential expiry, shift 24 h reminder, unfilled-shift alert.
- No new HTTP routes, so no Postman regen. The 6 spec routes and their contract tests stay untouched.
- No preferences/opt-out (future `notification_preferences`, ARCHITECTURE §17).
- Code, comments and commits are in English. Run `/verify` before commit. Update `/task` + brain (`/wrap-session`).

## Notification catalog

### Event-driven (in the business tx)
| # | Trigger | Template | Recipients | Payload (whitelist) |
|---|---|---|---|---|
| E1 | `createShift` (`apps/api/src/modules/shifts/service.ts:79`) | `shift.posted` | eligible nurses in the shift's network | shiftId, role, date, startTime, endTime, agencyName, facilityName\|null |
| E2 | `claimShift` (`:134`) | `shift.claimed.agency` | owning agency owners/managers | shiftId, role, date, startTime, endTime, nurseName |
| E3 | `claimShift` | `shift.claimed.nurse` | claiming nurse (the actor) | shiftId, role, date, startTime, endTime, agencyName |
| E4 | `cancelShift` (`:206`) | `shift.cancelled` (exists) | unchanged: nurse cancels → owners/managers. Agency/admin cancels → previous nurse + other owners/managers | unchanged |
| E5 | `upload` (`apps/api/src/modules/credentials/service.ts:64`) | `credential.submitted` | admins of `actor.nurseNetworkId` | nurseName |
| E6 | `review` (`credentials/service.ts:129`) | `credential.reviewed` | the credential's nurse | outcome `verified`\|`rejected` |

### Time-based (reminder sweep)
| # | Condition | Template | Recipients | dedupe_key |
|---|---|---|---|---|
| S1 | current credential `expires_on` within 30 d (window `30d`) or 7 d (window `7d`) of nurse "today" | `credential.expiring` | nurse | `cred-exp:<credId>:30d` / `cred-exp:<credId>:7d` |
| S2 | current credential `expires_on < today` | `credential.expired` | nurse + network admins | `cred-expired:<credId>:<userId>` |
| S3 | current **license** `expires_on < shift_date` of a `filled` future shift the nurse holds, within the next 30 d | `shift.nurse_license_lapses` | that shift's agency owners/managers | `lapse:<shiftId>:<credId>:<userId>` |
| S4 | `filled` shift whose local start is in `(now, now+24h]` | `shift.reminder` | `claimed_by` nurse | `remind:<shiftId>:<nurseId>` |
| S5 | `open` shift whose local start is in `(now, now+24h]` | `shift.unfilled` | owning agency owners/managers | `unfilled:<shiftId>:<userId>` |

"Current credential" = non-deleted, `status <> 'rejected'`, and no newer (`created_at`) non-deleted, non-rejected credential of the same `type` for that nurse. Superseded credentials are skipped. Shift local start = `(shift_date + start_time) AT TIME ZONE shifts.timezone`. Nurse "today" = `todayIn(networkDefaultTimezone(networkId), now)` (same rule as `credentials/service.ts:34`). The 7 d window does not suppress 30 d, so a nurse uploading 5 days before expiry gets both, once each. Acceptable.

### Per role
- **Nurse:** E1, E3, E4 (agency/admin cancelled), E6, S1, S2, S4.
- **Agency owner/manager:** E2, E4, S3, S5.
- **Admin:** E5, S2.

## Steps

1. **Schema: dedupe key.** In `apps/api/src/db/schema/system.ts`, `notifications` table: add `dedupeKey: text()`. Add `uniqueIndex("notifications_dedupe_uq").on(t.dedupeKey).where(sql\`${t.dedupeKey} IS NOT NULL\`)`. Run `pnpm --filter api db:generate`, rename the output to `0005_notification_dedupe.sql`, then read the SQL and fix the statement order if drizzle misorders it. Expected SQL is under Migrations.

2. **`apps/api/src/modules/notifications/recipients.ts` (new).** `type Q = Db | Tx`, `type Recipient = { userId: string; email: string }`. Every query filters `users.status='active'` and `isNull(users.deletedAt)`.
   - `agencyManagers(q, agencyId): Promise<Recipient[]>`: move the body from `cancelRecipients` (`apps/api/src/modules/shifts/repository.ts:304`). `cancelRecipients` then calls it (keep its signature).
   - `networkAdmins(q, networkId)`: `network_memberships` (revokedAt null) join `users` where `users.role='admin'`.
   - `eligibleNurses(q, networkId, role, shiftDate, today)`: select nurse users with `nurse_profiles.network_id = networkId` + licenseType. Load their non-deleted `type='license'` credentials in one query (`inArray(nurseId, ids)`). Filter in TS with `roleMatchesLicense(licenseType, role)` && `isEligible(licensesOfNurse, { shiftDate }, today)` from `apps/api/src/modules/shifts/eligibility.ts`.
   - `userRecipient(q, userId): Promise<Recipient | null>` and `userName(q, userId)` (`user_profiles.full_name`).

3. **`apps/api/src/modules/notifications/enqueue.ts` (new).**
   ```ts
   export async function enqueue(tx: Q, a: { template: string; payload: Record<string, unknown>;
     recipients: Recipient[]; excludeUserId?: string; dedupeKey?: (r: Recipient) => string }): Promise<number>
   ```
   Dedupes recipients by userId and drops `excludeUserId`. Builds rows `{ id: \`ntf_${randomUUID()}\`, recipientUserId, recipientEmail, template, payload, dedupeKey }`. Inserts with `.onConflictDoNothing({ target: notifications.dedupeKey, where: sql\`dedupe_key IS NOT NULL\` })` when `dedupeKey` is given, plain insert otherwise. Returns the inserted count (`.returning({id})`). Replace `insertNotifications` (`shifts/repository.ts:325`) usages with `enqueue`. Refactor `cancelShift` (`service.ts:255-265`) to `enqueue` with the same recipient logic.

4. **Templates (`apps/api/src/modules/notifications/templates.ts`).**
   - Extract `layout({ subject, heading, intro, rows: [string,string][], outro? }, appUrl?) → RenderedMail`, built from the current `shiftCancelled` HTML/text. The footer line `Sign in to ShiftPatch: <appUrl>` is added only when `appUrl` is set. Every value goes through `escapeHtml`, and the subject through `oneLine`.
   - Make `shiftCancelled` use `layout`, with byte-identical output apart from the optional footer (existing tests must pass).
   - New renderers, one per template name in the catalog: `shift.posted`, `shift.claimed.agency`, `shift.claimed.nurse`, `credential.submitted`, `credential.reviewed`, `credential.expiring`, `credential.expired`, `shift.nurse_license_lapses`, `shift.reminder`, `shift.unfilled`. Each uses `field()` for required keys (missing → `PermanentMailError`). `credential.reviewed` throws `PermanentMailError` for an outcome outside `verified|rejected`.
   - Subjects (all ASCII): `New {role} shift on {date}`, `{nurseName} claimed your {role} shift on {date}`, `You're booked: {role} on {date}`, `Credential awaiting review`, `Your credential was verified` / `Your credential was rejected`, `A credential expires on {expiresOn}`, `A credential has expired`, `Booked nurse's license lapses before {date}`, `Reminder: {role} shift {date} {startTime}`, `Unfilled: {role} shift {date} {startTime}`.
   - `credential.expiring` / `credential.expired` payload: `expiresOn` (nurse email only). The admin variant of `credential.expired` uses payload `{ nurseName }` only. Decide via a `audience: "nurse"|"admin"` payload field, validated.
   - Signature: `renderTemplate(template, payload, opts?: { appUrl?: string })`. `dispatcher.ts:73` passes `opts.appUrl` (new `DispatcherOptions.appUrl`). `server.ts` passes `process.env.APP_ORIGIN`.

5. **Event hooks.**
   - `createShift`: inside the tx after `recordAudit`, `today = todayIn(timezone, new Date())`. `enqueue(tx, { template: "shift.posted", recipients: await eligibleNurses(tx, networkId, input.role, input.date, today), payload })`. `agencyName`/`facilityName` come from `repo.shiftView(tx, created.id)` (has `agencyName`). Add the facility name to `shiftView` only if it is missing.
   - `claimShift`: after audit, `view = await repo.shiftView(tx, shift.id)` (already called for the return; reuse it). Then `enqueue` `shift.claimed.agency` → `agencyManagers(tx, shift.agencyId)`, and `shift.claimed.nurse` → `[userRecipient(tx, actor.userId)]`. Times are `view.startTime.slice(0,5)` like cancel.
   - `credentials.upload`: inside the tx after audit, `enqueue` `credential.submitted` → `networkAdmins(tx, actor.nurseNetworkId!)`, payload `{ nurseName }`.
   - `credentials.review`: inside the tx after audit, `enqueue` `credential.reviewed` → `[userRecipient(tx, row.nurseId)]`, payload `{ outcome: status }`.

6. **Reminder sweep: `apps/api/src/modules/notifications/reminders.ts` (new).**
   ```ts
   export const SWEEP_LOCK_KEY = 728_431_005; // arbitrary constant for pg advisory lock
   export function createReminderSweep(o: { db: Db; intervalMs?: number /*900_000*/; now?: () => Date; onError?: (e: unknown) => void })
     // returns { tick(): Promise<{ inserted: number; skipped: boolean }>, start(), stop() }
   ```
   - `start/stop`: copy the dispatcher pattern (`dispatcher.ts:93-114`): `running` guard, `timer.unref()`, `stop()` awaits the tick in flight.
   - `tick`: `db.transaction(async tx => { const [{ got }] = await tx.execute(sql\`select pg_try_advisory_xact_lock(${SWEEP_LOCK_KEY}) as got\`); if (!got) return skipped; ...S1..S5 })`. Dedupe keys keep it correct even without the lock. The lock only avoids wasted work across replicas.
   - S1/S2/S3: one query for current credentials with `expires_on <= (now + 31 days)::date`, joined to nurse_profiles (networkId), users (active), and user_profiles (name), `LIMIT 500 ORDER BY expires_on`. Compute today per network in TS (cache by networkId). Classify: `expiresOn < today` → S2. `expiresOn <= today+7` → S1 `7d`. `expiresOn <= today+30` → S1 `30d`. For license rows not expired by today, S3: query `filled` shifts `claimed_by = nurse AND shift_date > expires_on AND shift_date <= today+30 AND deleted_at IS NULL`, recipients `agencyManagers(shift.agencyId)`.
   - "Current" filter in SQL: `NOT EXISTS (select 1 from credentials c2 where c2.nurse_id = c.nurse_id and c2.type = c.type and c2.deleted_at is null and c2.status <> 'rejected' and c2.created_at > c.created_at)`.
   - S4/S5: `select ... from shifts where deleted_at is null and status in ('filled','open') and ((shift_date + start_time) at time zone timezone) > ${at} and ((shift_date + start_time) at time zone timezone) <= ${at} + interval '24 hours' limit 500`. S4 recipient is `userRecipient(claimed_by)`. S5 recipients are `agencyManagers(agency_id)`. Payload: role, date, startTime(HH:MM), endTime, agencyName.
   - Date-add helper: `addDays(isoDate, n)` on UTC-noon `Date` → ISO date (no tz drift).

7. **Wire up `apps/api/src/server.ts`.** Next to the dispatcher: `if (process.env.REMINDERS !== "off") { const sweep = createReminderSweep({ db, intervalMs: Number(process.env.REMINDER_INTERVAL_MS) || 900_000, onError: (err) => app.log.error({ err }, "reminder sweep tick failed") }); sweep.start(); }`. Stop it in the same shutdown path before the DB closes. Pass `appUrl: process.env.APP_ORIGIN` to `createDispatcher`.

8. **Docs/brain.** In `docs/ARCHITECTURE.md` §10, replace the MVP channels bullet with the catalog tables above, and add the "Reminder sweep" + `dedupe_key` notes. Add a section "Email notifications v2 (2026-11-xx)" to `brain/Decisions.md`: catalog, no credential type/TB in mail, claim-confirmation actor exception, dedupe key, advisory lock, 15 min interval. Run `/task add "Email notifications v2: event + reminder emails"` (Stage `5 Audit+Notify`, Scope MVP), set it Active at the start and Done after verification. Edit the Extras row "Facility management + expiry reminder emails" to note that expiry reminders are done (facility management still open). Then `/wrap-session`.

## Files touched
| File | Change |
|---|---|
| `apps/api/src/db/schema/system.ts` | `dedupeKey` column + partial unique index |
| `apps/api/src/db/migrations/0005_notification_dedupe.sql` (+ meta snapshot/journal) | generated, reviewed |
| `apps/api/src/modules/notifications/recipients.ts` | new: agencyManagers, networkAdmins, eligibleNurses, userRecipient, userName |
| `apps/api/src/modules/notifications/enqueue.ts` | new: shared outbox insert with dedupe |
| `apps/api/src/modules/notifications/templates.ts` | `layout()` + 10 new renderers + `appUrl` option |
| `apps/api/src/modules/notifications/dispatcher.ts` | `appUrl` option passed to `renderTemplate` |
| `apps/api/src/modules/notifications/reminders.ts` | new sweep S1–S5 |
| `apps/api/src/modules/shifts/service.ts` | hooks in createShift, claimShift; cancelShift uses enqueue |
| `apps/api/src/modules/shifts/repository.ts` | cancelRecipients delegates; insertNotifications removed/re-exported |
| `apps/api/src/modules/credentials/service.ts` | hooks in upload, review |
| `apps/api/src/server.ts` | start/stop sweep, appUrl |
| `.env.example` | `REMINDERS`, `REMINDER_INTERVAL_MS` |
| tests: `notifications/templates.test.ts`, `notifications/reminders.test.ts`, additions in `shifts/claim-cancel.test.ts`, `shifts/shifts.test.ts`, `credentials/credentials.test.ts` | see Verify |
| `docs/ARCHITECTURE.md` §10, `brain/Decisions.md`, `brain/Tasks.md` | docs |

## Migrations / config
Expected `0005_notification_dedupe.sql`:
```sql
ALTER TABLE "notifications" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("dedupe_key") WHERE "notifications"."dedupe_key" IS NOT NULL;
```
`.env.example` additions (below the `OUTBOX_INTERVAL_MS` line):
```
# Reminder sweep (credential expiry, shift 24h reminder, unfilled alert). REMINDERS=off disables it; interval default 900000 ms (15 min).
REMINDERS=on
REMINDER_INTERVAL_MS=900000
```
Prod (Railway): no new vars required (defaults apply). `APP_ORIGIN` already set. Migrations run on deploy as before.

## Verify
1. Tests (Vitest + real Postgres; pin timestamps explicitly in the past, because Postgres `now()` µs vs JS ms clock race, see `notifications.test.ts` `enqueue`):
   - `templates.test.ts`: each template renders subject/text/html. `<script>` in a payload value is escaped. CR/LF in role/date is stripped from the subject. A missing field gives `PermanentMailError`. An extra payload key (e.g. `objectKey`) never appears in the output. No output contains "TB" or "license document". `shift.cancelled` output is unchanged without `appUrl`.
   - Shift service: post a shift as agency-a (seed: the RN shift) → a `shift.posted` row for nurse-1 only (nurse-2 has an expired license, so no row). A role mismatch gives no row. Claim → 1 row per owner/manager + 1 `shift.claimed.nurse` row for the claimer, and no row for a viewer. Forced outbox failure (trigger trick from `claim-cancel.test.ts`) rolls back create and claim.
   - Credentials: upload → `credential.submitted` for the network admin only (not for the other network's admin). Review → a `credential.reviewed` row for the nurse.
   - `reminders.test.ts`, with fixed `now`: S1 30d and 7d, S2 nurse+admin, S3 agency, S4 nurse, S5 managers each insert exactly once. A second `tick()` returns `inserted: 0`. A superseded/rejected credential is skipped. Suspended users and viewers are skipped. Timezone edge: a shift at 00:30 `America/New_York` vs UTC `now`. A second concurrent `tick()` while the lock is held → `skipped: true`.
2. `/verify` (typecheck, lint, test, test:contract). Run it alone, with Docker Postgres up.
3. Mailpit smoke: `docker compose up -d postgres mailpit` → `pnpm --filter api db:reset` → `MAIL_TRANSPORT=smtp REMINDER_INTERVAL_MS=10000 pnpm --filter api start:local` (background; check that port 3001 is free first). Via Postman local env or `apps/api/scripts/e2e-flow.mjs`: agency-a posts → nurse-1 claims → agency-a cancels → nurse-1 uploads a credential → admin verifies. In http://localhost:8025, check E1, E2, E3, E4, E5 and E6, each to the right seed address. Then insert a credential expiring in 5 days and a filled shift starting in 3 h (psql in `shiftpatch-postgres-1`), wait 10 s, and check S1/S4 mails. Restart the API, wait one tick: no duplicates.
4. `/wrap-session`.

## Out of scope
- Notification preferences / unsubscribe / digests (future `notification_preferences` table).
- SMS / push / in-app inbox.
- Emails on withdraw, login, logout, refresh-reuse, document viewed.
- Auto-unassigning a nurse whose license is rejected/lapses (board item "Warn or unassign when a license is rejected after a claim", Later). S3 only warns the agency.
- Facility management (other half of the Extras row).
- Moving the sweep to Railway cron / a separate worker (upgrade path in ARCHITECTURE §10; the outbox table stays the same).
