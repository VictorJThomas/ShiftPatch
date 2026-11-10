# Audit coverage

Every mutating route, the audit action(s) it writes, and whether the row commits in the same transaction as the change. The helper is `recordAudit(db | tx, entry)` (`apps/api/src/modules/audit/audit.ts`); `action` is typed by the exported `AuditAction` union, which mirrors the catalog in `docs/ARCHITECTURE.md` §11. Rows never hold passwords, tokens, signed links or object keys (`redactChanges`).

| Route / service | Action | Same tx? | Notes |
|---|---|---|---|
| `POST /api/auth/login` (`auth/service.login`) | `auth.login` | Yes | Same tx as the refresh-token insert and `last_login_at`. Scope from `auditScopeOf`. |
| `POST /api/auth/login` (failure) | `auth.login_failed` | n/a (no change to roll back) | Own insert. Stores `emailSha256` only, never the email or password. `entityId` is the user id or `unknown`. |
| `POST /api/auth/refresh` (`auth/service.refresh`), reuse detected | `auth.refresh_reuse_detected` | Yes | Same tx as the family revoke. Written only when the revoke touched a live token. |
| `POST /api/auth/refresh`, user suspended or deleted since login | `auth.logout` with `{ reason: "suspended" }` | Yes | Same tx as the family revoke; scoped via `auditScopeOf`. Written only when the revoke touched a live token. |
| `POST /api/auth/logout` (`auth/service.logout`) | `auth.logout` | Yes | Same tx as the family revoke. Idempotent: an already-revoked or unknown token writes nothing. |
| `POST /api/shifts` (`shifts/service.createShift`) | `shift.created` | Yes | Same tx as the insert and the `shift.posted` outbox rows. |
| `POST /api/shifts/:id/claim` (`shifts/service.claimShift`) | `shift.claimed` | Yes | Same tx as the atomic `UPDATE ... WHERE status='open'` and the outbox rows. A lost race (409) writes nothing. |
| `POST /api/shifts/:id/claim`, blocked | `access.denied` with `{ reason }` | No, by design | Reasons: `credential_expired`, `no_valid_credential`, `license_role_mismatch`. The claim tx returns early with nothing written, so the denial row is written after it and persists. `entityType=shift`, `entityId=shift id`, `networkId`/`agencyId` from the shift. No `shift.claimed` row. |
| `POST /api/shifts/:id/cancel` (`shifts/service.cancelShift`) | `shift.cancelled` | Yes | Same tx as the reopen, the cancellation history row and the outbox rows. Carries the reason. |
| `POST /api/shifts/:id/withdraw` (`shifts/service.withdrawShift`) | `shift.withdrawn` | Yes | Same tx as the open -> cancelled update. |
| `POST /api/shifts/:id/timesheet` (`timesheets/service.submit`) | `timesheet.submitted` | Yes | Same tx as the timesheet insert (or the disputed -> submitted resubmit) and the `timesheet.submitted` outbox rows (agency owners/managers). Shift row locked first. `changes` carry status, clock times, break, worked minutes; never the nurse's free-text note. A refusal (400/404/409) writes nothing. |
| `POST /api/timesheets/:id/approve` (`timesheets/service.approve`) | `timesheet.approved` | Yes | Same tx as submitted -> approved, the shift `filled -> completed` update and the nurse's outbox row. `changes`: `status`, `shiftStatus`. |
| `POST /api/timesheets/:id/dispute` (`timesheets/service.dispute`) | `timesheet.disputed` | Yes | Same tx as submitted -> disputed (shift stays filled) and the nurse's outbox row. The reason is stored on the timesheet row (`review_note`), not in `changes`, and is not mailed. |
| `POST /api/nurses/me/credentials` (`credentials/service.upload`) | `credential.uploaded` | Yes | Same tx as the credential row and the outbox row. No file key, name or hash in `changes`. |
| `PATCH /api/credentials/:id/review` (`credentials/service.review`) | `credential.reviewed` | Yes | Same tx as the status update (row locked) and the outbox row. |
| `PATCH /api/credentials/:id/review`, credential exists but is out of the admin's scope | `access.denied` with `{ reason: "out_of_scope" }` | No, by design | Response stays the uniform 404. Written after the tx. A nonexistent id writes nothing. |
| `GET /api/credentials/:id/download-url` (`credentials/service.documentUrl`) | `credential.document_viewed` | n/a (read; no data change) | Written BEFORE the link is signed: no audit row, no link. No key or URL in `changes`. |
| `GET /api/credentials/:id/download-url`, credential exists but the actor may not see it | `access.denied` with `{ reason: "out_of_scope" }` | n/a | Response stays the uniform 404. A nonexistent id or a file-less credential the actor may see writes nothing. |

## Catalog actions with no route (N/A in the MVP)

`shift.deleted`, `agency.updated`, `membership.granted`, `membership.revoked`: no API route mutates these yet, so nothing writes them. They stay in the `AuditAction` union so the catalog and the type agree.

## Not audited, by design

- The background notification dispatcher and the reminder sweep: system jobs that deliver outbox rows; the outbox row itself is the record, and it commits in the same tx as the audited change that caused it.
- Read-only routes (lists, `GET /api/audit-logs`, `/api/me`): no change to record. The one audited read is the credential document link above.
