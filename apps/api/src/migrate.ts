import { readdirSync, readFileSync } from "node:fs";
import { pool } from "./db.js";

const dir = new URL("../migrations/", import.meta.url);
await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)");
// databases created before this table existed already have 001 applied
const legacy = await pool.query("SELECT to_regclass('public.users') AS t");
if (legacy.rows[0].t) await pool.query("INSERT INTO schema_migrations VALUES ('001_init.sql') ON CONFLICT DO NOTHING");

for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  const done = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
  if (done.rowCount) continue;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(readFileSync(new URL(name, dir), "utf8"));
    await client.query("INSERT INTO schema_migrations VALUES ($1)", [name]);
    await client.query("COMMIT");
    console.log("applied", name);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
console.log("up to date");
await pool.end();
