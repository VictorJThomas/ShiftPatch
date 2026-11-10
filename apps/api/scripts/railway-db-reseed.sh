#!/usr/bin/env bash
# Restore the PRODUCTION database to the exact spec seed before submission (docs/release/prod-reseed.md).
# Runs over `railway ssh` (Postgres is private). Run from the repo root on master, Railway CLI logged in + linked.
#
#   bash apps/api/scripts/railway-db-reseed.sh preflight   # read-only: target, migration state, row counts, backup to ~/shiftpatch-backups
#   bash apps/api/scripts/railway-db-reseed.sh reset       # DESTRUCTIVE: asks you to type the database name, then drop + migrate + seed + role
#
# Why not db:seed alone: the seed is ON CONFLICT DO NOTHING, so a drifted DB stays drifted; the audit_log trigger blocks TRUNCATE.
# Why not railway-db-setup.sh: it also rewrites api variables (MAIL_TRANSPORT=log etc.). This script never touches variables.
set -euo pipefail
R="npx -y @railway/cli"
API="${API_SERVICE:-api}"
PG="${PG_SERVICE:-Postgres}"
MODE="${1:-}"
quiet() { grep -vE 'Config as Code|Migrate:|Existing files|Using SSH key' || true; }
psql_pg() { $R ssh -s "$PG" -- sh -c "psql \"\$DATABASE_URL\" -X -v ON_ERROR_STOP=1 $1" 2>&1 | quiet; }

echo "== target"
$R status
DBNAME="$($R ssh -s "$PG" -- printenv PGDATABASE 2>/dev/null | tr -d '\r' | tail -1)"
echo "database: $DBNAME (service $PG)"

case "$MODE" in
preflight)
  echo "== applied migrations (last 3)"
  psql_pg "-tAc \"select id, created_at from drizzle.__drizzle_migrations order by id desc limit 3\""
  echo "== row counts"
  psql_pg "-tAc \"select 'users', count(*) from users union all select 'agencies', count(*) from agencies union all select 'shifts', count(*) from shifts union all select 'credentials', count(*) from credentials union all select 'audit_log', count(*) from audit_log union all select 'notifications', count(*) from notifications\""
  echo "== backup (custom format, streamed to this machine; NOT committed)"
  mkdir -p "$HOME/shiftpatch-backups"
  OUT="$HOME/shiftpatch-backups/prod-$(date +%Y%m%d-%H%M%S).dump"
  $R ssh -s "$PG" -- sh -c 'pg_dump "$DATABASE_URL" -Fc | base64 -w0' 2>/dev/null | tr -d '\r\n' | base64 -d > "$OUT"
  SIZE="$(wc -c < "$OUT")"
  [ "$SIZE" -gt 1000 ] || { echo "backup looks empty ($SIZE bytes): stop" >&2; exit 1; }
  echo "backup: $OUT ($SIZE bytes)"
  ;;
reset)
  read -r -p "Type the database name ($DBNAME) to DROP and reseed it: " ANSWER
  [ "$ANSWER" = "$DBNAME" ] || { echo "aborted"; exit 1; }
  ls "$HOME"/shiftpatch-backups/prod-*.dump >/dev/null 2>&1 || { echo "no backup in ~/shiftpatch-backups: run preflight first" >&2; exit 1; }
  echo "== drop schemas"
  psql_pg "-c 'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;'"
  OWNER="$($R ssh -s "$PG" -- printenv DATABASE_URL 2>/dev/null | tr -d '\r' | grep '^postgres')"
  echo "== migrate + seed as owner (api container)"
  $R ssh -s "$API" -- sh -c "cd /app && MIGRATE_DATABASE_URL='$OWNER' pnpm --filter api db:migrate && MIGRATE_DATABASE_URL='$OWNER' pnpm --filter api db:seed" 2>&1 | quiet
  echo "== least-privilege grants (tables are new)"
  APPPW="$($R variables --service "$API" --kv 2>/dev/null | sed -n 's/^APP_DB_PASSWORD=//p')"
  [ -n "$APPPW" ] || { echo "APP_DB_PASSWORD missing on $API" >&2; exit 1; }
  B64="$(base64 -w0 docs/security/db-least-privilege.sql)"
  $R ssh -s "$PG" -- sh -c "echo $B64 | base64 -d > /tmp/lp.sql && psql \"\$DATABASE_URL\" -q -v app_password='$APPPW' -f /tmp/lp.sql; rc=\$?; rm -f /tmp/lp.sql; exit \$rc" 2>&1 | quiet
  echo "== verify"
  psql_pg "-tAc \"select 'users='||(select count(*) from users)||' agencies='||(select count(*) from agencies)||' shifts='||(select count(*) from shifts)||' credentials='||(select count(*) from credentials)||' audit='||(select count(*) from audit_log)\""
  psql_pg "-tAc \"select id, role, shift_date, status, coalesce(claimed_by,'-') from shifts order by id\""
  echo "expect: users=5 agencies=2 shifts=3 credentials=2 audit=0; shift-1 open, shift-2 filled nurse-1, shift-3 open"
  ;;
*) echo "usage: $0 preflight|reset" >&2; exit 2 ;;
esac
