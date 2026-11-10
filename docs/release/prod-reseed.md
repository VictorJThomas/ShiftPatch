# Production reseed: restore the exact spec data before submission

Production holds QA test data. The graders must find the exact spec seed: 2 agencies, nurse-1/2, admin-1, shift-1..3, with shift-1 open.
This is a **destructive release gate**. Victor runs it; the auto-mode classifier blocks prod DB access for Claude.

Script: `apps/api/scripts/railway-db-reseed.sh` (over `railway ssh`; the DB is private). There is no HTTP reset endpoint, and `pnpm --filter api db:reset` refuses Railway.

## When
Last step: after the final PR is merged, CD is green, and the post-deploy smoke test passes. Nothing should write test data afterwards except the Loom recording.

## 1. Preflight (read-only + backup)
```bash
bash apps/api/scripts/railway-db-reseed.sh preflight
```
Check:
- `railway status` shows project **ShiftPatch**, environment **production**.
- The last applied migration id matches the number of entries in `apps/api/src/db/migrations/meta/_journal.json`.
- Row counts look like test data, not real users. Seed users are `@example.com` / `.example`, so anything else means stop and ask.
- A backup file exists in `~/shiftpatch-backups/` and is larger than 1 KB. It is never committed. Delete it after submission.

## 2. Reset (destructive)
```bash
bash apps/api/scripts/railway-db-reseed.sh reset
```
The script asks you to type the database name, refuses to run without a backup, then:
1. `DROP SCHEMA drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
2. Runs migrate and seed as the owner in the api container.
3. Re-applies `docs/security/db-least-privilege.sql`, because the grants were dropped with the tables.
4. Prints the verification counts.

It never touches Railway variables. `railway-db-setup.sh`, by contrast, would reset `MAIL_TRANSPORT=log`.

## 3. Verify
- The script prints `users=5 agencies=2 shifts=3 credentials=2 audit=0`, with shift-1 open, shift-2 filled by nurse-1, and shift-3 open.
- Through Vercel: `curl -s https://shiftpatch-web-orcin.vercel.app/api/health` returns `{"status":"ok"}`.
- Log in as each of the 5 seed users. maria.lopez sees shift-1/3. james.cook gets "Credential expired, cannot claim shift" on shift-1. Log out without claiming.
- Known leftover: R2 objects from earlier test uploads stay in the private bucket with no DB rows. They are harmless and unreachable (links are only signed for DB rows). Empty the bucket in the Cloudflare dashboard if you want it clean.

## Rollback
`pg_restore --clean --if-exists -d "$DATABASE_URL" <backup>`, run inside the Postgres container: copy the file in with base64, the same way the script copies SQL in.
