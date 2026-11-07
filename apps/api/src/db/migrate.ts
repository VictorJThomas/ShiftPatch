import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client.js";

// MIGRATE_DATABASE_URL = the schema owner (prod: the API's runtime DATABASE_URL is the least-privilege role, which has no DDL).
const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("MIGRATE_DATABASE_URL or DATABASE_URL is required");
const { db, sql } = createDb(url);
try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)) });
} finally {
  await sql.end();
}
console.log("migrations applied");
