import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createDb } from "./client.js";

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://shiftpatch:shiftpatch@localhost:5432/postgres";

/** Creates a throwaway database, applies all migrations, returns a client + cleanup. Never touches the dev DB. */
export async function createTestDb() {
  const name = `shiftpatch_test_${randomBytes(4).toString("hex")}`;
  const admin = postgres(ADMIN_URL, { max: 1 });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const { db, sql } = createDb(url.toString());
  const drop = async () => {
    await sql.end();
    await admin.unsafe(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  };
  try {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)) });
  } catch (err) {
    await drop(); // don't leak the database if migrations fail
    throw err;
  }
  return {
    db,
    sql,
    url: url.toString(),
    drop,
  };
}
