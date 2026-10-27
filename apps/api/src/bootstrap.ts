// Cria usuário e banco de DATABASE_URL (.env) num Postgres já instalado e aplica as migrations.
// Admin: ADMIN_DATABASE_URL (padrão postgres://postgres:postgres@<host>:<porta>/postgres).
import pg from "pg";

const target = new URL(process.env.DATABASE_URL!);
const user = decodeURIComponent(target.username);
const password = decodeURIComponent(target.password);
const database = target.pathname.slice(1);

const admin = new URL(process.env.ADMIN_DATABASE_URL ?? target.href);
if (!process.env.ADMIN_DATABASE_URL) {
  admin.username = "postgres";
  admin.password = "postgres";
  admin.pathname = "/postgres";
}
const client = new pg.Client({ connectionString: admin.href });
await client.connect();

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

const hasRole = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [user]);
if (!hasRole.rowCount) await client.query(`CREATE ROLE ${q(user)} LOGIN PASSWORD ${lit(password)}`);
const hasDb = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
if (!hasDb.rowCount) await client.query(`CREATE DATABASE ${q(database)} OWNER ${q(user)}`);
await client.end();
console.log(`banco "${database}" pronto`);

await import("./migrate.js");
