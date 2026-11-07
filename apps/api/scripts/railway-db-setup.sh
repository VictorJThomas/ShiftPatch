#!/usr/bin/env bash
# One-time production database setup on Railway (ARCHITECTURE §15 step 5). Run from the repo root, Railway CLI logged in
# and linked to the ShiftPatch project, Docker running (psql comes from the postgres image):
#
#   bash apps/api/scripts/railway-db-setup.sh
#
# 1. adds a Postgres service if the project has none
# 2. migrates + seeds the exact spec data AS THE OWNER (public proxy URL, from this machine)
# 3. creates the least-privilege role shiftpatch_app (docs/security/db-least-privilege.sql)
# 4. points the api service at it: DATABASE_URL = shiftpatch_app (runtime), MIGRATE_DATABASE_URL = owner (pre-deploy migrate)
# 5. proves the role: connects, cannot DELETE from audit_log
# Re-runnable. Prints no secret. Variables are set with --skip-deploys: deploy the merged master afterwards.
set -euo pipefail
R="npx -y @railway/cli"
API_SERVICE="${API_SERVICE:-api}"
PG_SERVICE="${PG_SERVICE:-Postgres}"
var() { $R variables --service "$1" --kv 2>/dev/null | sed -n "s/^$2=//p"; }

if [ -z "$(var "$PG_SERVICE" DATABASE_PUBLIC_URL)" ]; then
  echo "== adding Postgres service"
  $R add --database postgres
  for _ in $(seq 1 30); do [ -n "$(var "$PG_SERVICE" DATABASE_PUBLIC_URL)" ] && break; sleep 5; done
fi
OWNER="$(var "$PG_SERVICE" DATABASE_PUBLIC_URL)"
[ -n "$OWNER" ] || { echo "no DATABASE_PUBLIC_URL on service $PG_SERVICE" >&2; exit 1; }

APPPW="$(var "$API_SERVICE" APP_DB_PASSWORD)"
if [ -z "$APPPW" ]; then
  APPPW="$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('base64url'))")"
  printf %s "$APPPW" | $R variables --service "$API_SERVICE" --skip-deploys --set-from-stdin APP_DB_PASSWORD >/dev/null # not in argv
  echo "== generated APP_DB_PASSWORD (stored on $API_SERVICE)"
fi

echo "== migrate + seed as owner"
MIGRATE_DATABASE_URL="$OWNER" pnpm --filter api db:migrate
MIGRATE_DATABASE_URL="$OWNER" pnpm --filter api db:seed

echo "== least-privilege role"
MSYS_NO_PATHCONV=1 docker run --rm -i postgres:16-alpine psql "$OWNER" -q -v app_password="$APPPW" < docs/security/db-least-privilege.sql

echo "== api service variables"
$R variables --service "$API_SERVICE" --skip-deploys \
  --set 'MIGRATE_DATABASE_URL=${{'"$PG_SERVICE"'.DATABASE_URL}}' \
  --set 'DATABASE_URL=postgresql://shiftpatch_app:${{APP_DB_PASSWORD}}@${{'"$PG_SERVICE"'.PGHOST}}:${{'"$PG_SERVICE"'.PGPORT}}/${{'"$PG_SERVICE"'.PGDATABASE}}' \
  --set 'MAIL_TRANSPORT=log' --set 'MAIL_FROM=ShiftPatch <no-reply@shiftpatch.app>' --set 'OUTBOX_DISPATCHER=on' --set 'COOKIE_SECURE=true' >/dev/null

echo "== prove the role (public proxy)"
APP_URL="$(node -e "const u=new URL(process.argv[1]);u.username='shiftpatch_app';u.password=process.argv[2];process.stdout.write(u.href)" "$OWNER" "$APPPW")"
MSYS_NO_PATHCONV=1 docker run --rm postgres:16-alpine psql "$APP_URL" -tAc "select current_user || ' shifts=' || (select count(*) from shifts)"
if MSYS_NO_PATHCONV=1 docker run --rm postgres:16-alpine psql "$APP_URL" -tAc "delete from audit_log" >/dev/null 2>&1; then
  echo "FAIL: shiftpatch_app could delete from audit_log" >&2; exit 1
fi
echo "OK: audit_log DELETE denied for shiftpatch_app"
echo "done. Next: deploy master (api), then vercel --prod."
