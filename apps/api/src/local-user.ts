import type { SessionUser } from "@view/contracts";
import { pool } from "./db.js";

// No login: every request acts as this single admin user, which owns the measurements (annotations.author_id).
// shortcut: anyone who can reach the API can read every study; add real auth before exposing it beyond localhost.
export async function ensureLocalUser(): Promise<SessionUser> {
  const inst = await pool.query("INSERT INTO institutions(name) VALUES ('Local') ON CONFLICT (name) DO UPDATE SET name = 'Local' RETURNING id");
  const { rows } = await pool.query(
    `INSERT INTO users(email, password_hash, institution_id, role) VALUES ('local@view.local', '!', $1, 'admin')
     ON CONFLICT (email) DO UPDATE SET role = 'admin' RETURNING id, email, institution_id, role`,
    [inst.rows[0].id],
  );
  const u = rows[0];
  return { id: u.id, email: u.email, institutionId: u.institution_id, role: u.role };
}
