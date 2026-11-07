import { fileURLToPath, pathToFileURL } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createDb } from "./client.js";
import { seed } from "./seed.js";

// Local-only: restores the exact spec seed (shift-1 open, 3 shifts, 5 users) between manual/QA runs.
// Drops and recreates the database instead of truncating, so the append-only audit_log trigger
// (ENABLE ALWAYS, blocks TRUNCATE for every role) is never disabled.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const SAFE_DB_NAME = /^shiftpatch(_[a-z0-9_]+)?$/;

/** Throws unless the URL points at a local shiftpatch* database and the process is not in a deployed environment. */
export function assertLocalDatabase(rawUrl: string, env: NodeJS.ProcessEnv = process.env): { dbName: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("db:reset refused: DATABASE_URL is not a valid URL");
  }
  if (url.hash || url.search || rawUrl.includes("#")) {
    throw new Error("db:reset refused: query strings and fragments are not allowed in the reset URL");
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`db:reset refused: host "${url.hostname}" is not local`);
  }
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!SAFE_DB_NAME.test(dbName)) {
    throw new Error(`db:reset refused: database "${dbName}" does not match shiftpatch[_suffix]`);
  }
  // WHATWG URL and postgres.js parse differently (e.g. `localhost#@evil` is host "localhost" here but "evil" in
  // the driver), so also check what the driver itself would connect to.
  const probe = postgres(rawUrl, { max: 1, onnotice: () => {} });
  const { host, database } = probe.options;
  void probe.end({ timeout: 0 }); // never connected: no query was sent
  if (!host.every((h) => LOCAL_HOSTS.has(h)) || database !== dbName) {
    throw new Error("db:reset refused: the driver would connect to a different host or database than the URL shows");
  }
  if (env.NODE_ENV === "production" || env.RAILWAY_ENVIRONMENT || env.RAILWAY_ENVIRONMENT_NAME || env.RAILWAY_PROJECT_ID || env.VERCEL) {
    throw new Error("db:reset refused: running in a deployed environment");
  }
  return { dbName };
}

export async function resetDatabase(rawUrl: string) {
  const { dbName } = assertLocalDatabase(rawUrl);
  const adminUrl = new URL(rawUrl);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    // dbName is validated by SAFE_DB_NAME above (no quoting tricks possible).
    await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }
  const { db, sql } = createDb(rawUrl);
  try {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)) });
    await seed(db);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  await resetDatabase(url);
  console.log("db reset: dropped, migrated, seeded (exact spec data)");
}
