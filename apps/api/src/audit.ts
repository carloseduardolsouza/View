import { pool } from "./db.js";
import { inc } from "./metrics.js";

export function audit(e: { userId?: string; action: string; studyUid?: string; allowed: boolean; ip?: string }) {
  // audit must never break the request, but a failure must be visible in logs
  return pool
    .query("INSERT INTO audit_log(user_id, action, study_uid, allowed, ip) VALUES ($1,$2,$3,$4,$5)", [
      e.userId ?? null, e.action, e.studyUid ?? null, e.allowed, e.ip ?? null,
    ])
    .catch((err) => { inc("audit_write_failures_total"); console.error("audit write failed", err); });
}
