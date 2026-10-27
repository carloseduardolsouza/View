#!/usr/bin/env bash
# Usage: AUDIT_RETENTION_DAYS=365 scripts/audit-retention.sh   (default 365; run daily from cron/systemd timer)
# Deletes audit_log rows older than N days. Take a backup first if the audit trail has legal value (docs/lgpd.md).
. "$(dirname "$0")/_pg.sh"
DAYS="${AUDIT_RETENTION_DAYS:-365}"
[[ "$DAYS" =~ ^[0-9]+$ ]] && [ "$DAYS" -ge 1 ] || { echo "AUDIT_RETENTION_DAYS must be a positive integer" >&2; exit 1; }
pg psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "WITH d AS (DELETE FROM audit_log WHERE at < now() - interval '$DAYS days' RETURNING 1) SELECT count(*) AS deleted FROM d"
