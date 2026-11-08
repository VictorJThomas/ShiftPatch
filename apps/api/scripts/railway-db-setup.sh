#!/usr/bin/env bash
# Production database setup on Railway (ARCHITECTURE §15 step 5) over the PRIVATE network: the Postgres service has no
# public proxy, so everything runs inside Railway via `railway ssh`. Run from the repo root on master, Railway CLI logged
# in + linked, an SSH key registered (`railway ssh keys add`) and ssh.railway.com in ~/.ssh/known_hosts.
#
#   bash apps/api/scripts/railway-db-setup.sh            # migrate + seed + role + api variables (re-runnable)
#
# 1. reads the owner URL from the Postgres container (never printed)
# 2. migrates + seeds the exact spec data AS THE OWNER inside the api container
# 3. creates/updates the least-privilege role shiftpatch_app inside the Postgres container
# 4. sets the api variables (DATABASE_URL = shiftpatch_app, MIGRATE_DATABASE_URL = owner) -> triggers one redeploy
# 5. proves the role: cannot DELETE from audit_log, cannot CREATE
# It NEVER creates services: a missing Postgres service is an error (an earlier version added a duplicate database).
set -euo pipefail
R="npx -y @railway/cli"
API="${API_SERVICE:-api}"
PG="${PG_SERVICE:-Postgres}"
quiet() { grep -vE 'Config as Code|Migrate:|Existing files|Using SSH key' || true; }

OWNER="$($R ssh -s "$PG" -- printenv DATABASE_URL 2>/dev/null | tr -d '\r' | grep '^postgres' || true)"
[ -n "$OWNER" ] || { echo "cannot read DATABASE_URL from service '$PG' (missing service or SSH not set up)" >&2; exit 1; }

echo "== migrate + seed as owner (api container, private network)"
$R ssh -s "$API" -- sh -c "cd /app && MIGRATE_DATABASE_URL='$OWNER' pnpm --filter api db:migrate && MIGRATE_DATABASE_URL='$OWNER' pnpm --filter api db:seed" 2>&1 | quiet

APPPW="$($R variables --service "$API" --kv 2>/dev/null | sed -n 's/^APP_DB_PASSWORD=//p')"
if [ -z "$APPPW" ]; then
  APPPW="$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('base64url'))")"
  printf %s "$APPPW" | $R variables --service "$API" --skip-deploys --set-from-stdin APP_DB_PASSWORD >/dev/null # not in argv
fi

echo "== least-privilege role (Postgres container)"
B64="$(base64 -w0 docs/security/db-least-privilege.sql)"
$R ssh -s "$PG" -- sh -c "echo $B64 | base64 -d > /tmp/lp.sql && psql \"\$DATABASE_URL\" -q -v app_password='$APPPW' -f /tmp/lp.sql; rc=\$?; rm -f /tmp/lp.sql; exit \$rc" 2>&1 | quiet

echo "== prove the role"
APPURL="postgresql://shiftpatch_app:$APPPW@localhost:5432/\$PGDATABASE"
$R ssh -s "$PG" -- sh -c "psql \"$APPURL\" -tAc \"select current_user||' shifts='||(select count(*) from shifts)\"; psql \"$APPURL\" -tAc 'delete from audit_log' 2>&1 | head -1; psql \"$APPURL\" -tAc 'create table evil(i int)' 2>&1 | head -1" 2>&1 | quiet

echo "== api variables (one redeploy)"
$R variables --service "$API" \
  --set 'MIGRATE_DATABASE_URL=${{'"$PG"'.DATABASE_URL}}' \
  --set 'DATABASE_URL=postgresql://shiftpatch_app:${{APP_DB_PASSWORD}}@${{'"$PG"'.PGHOST}}:${{'"$PG"'.PGPORT}}/${{'"$PG"'.PGDATABASE}}' \
  --set 'MAIL_TRANSPORT=log' --set 'MAIL_FROM=ShiftPatch <no-reply@shiftpatch.app>' --set 'OUTBOX_DISPATCHER=on' --set 'COOKIE_SECURE=true' 2>&1 | quiet
echo "done: expect 'permission denied' twice above, then smoke-test the app."
