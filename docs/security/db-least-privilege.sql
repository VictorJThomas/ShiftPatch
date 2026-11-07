-- Least-privilege runtime role for the ShiftPatch API (ARCHITECTURE §13 "API <-> Postgres").
--
-- Two roles per environment:
--   * owner (the DATABASE_URL used by `pnpm db:migrate` / `db:seed`, e.g. Railway's default user): owns the schema, runs DDL.
--   * shiftpatch_app (the API's runtime DATABASE_URL): DML only, no DDL, audit_log append-only.
-- Run once per environment AS THE OWNER, after `db:migrate`, then point the API service at shiftpatch_app:
--   psql "$OWNER_DATABASE_URL" -v app_password="$APP_DB_PASSWORD" -f docs/security/db-least-privilege.sql
-- (password from an env var, never typed on the command line; psql quotes it via :'app_password'). One transaction, stops on
-- the first error: a missing -v app_password fails the whole run instead of half-applying it.
-- Re-runnable: re-applies grants (new tables from later migrations are covered by the DEFAULT PRIVILEGES below).
-- Local dev and CI keep the single superuser role on purpose (throwaway databases per test file).

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shiftpatch_app') THEN
    CREATE ROLE shiftpatch_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;
ALTER ROLE shiftpatch_app PASSWORD :'app_password';

-- No DDL anywhere: nobody but the owner creates objects in public.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE :"DBNAME" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"DBNAME" TO shiftpatch_app;
GRANT USAGE ON SCHEMA public TO shiftpatch_app;

-- DML on every table, sequences for generated ids (shift_id_seq, audit_log id).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO shiftpatch_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO shiftpatch_app;

-- audit_log: append + read only (the 0001 trigger blocks UPDATE/DELETE/TRUNCATE for every role too: two layers).
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM shiftpatch_app;
-- Migration bookkeeping is the owner's business.
REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM shiftpatch_app;

-- Tables created by future migrations (run by the owner) get the same DML grant automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO shiftpatch_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO shiftpatch_app;

COMMIT;
