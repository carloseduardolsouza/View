#!/usr/bin/env bash
# Usage: scripts/db-backup.sh [outfile]   (default: backups/view-<utc timestamp>.dump)
# Custom-format dump of the application database (annotations, preferences, audit_log...). Orthanc data is NOT included.
. "$(dirname "$0")/_pg.sh"
OUT="${1:-$ROOT/backups/view-$(date -u +%Y%m%dT%H%M%SZ).dump}"
mkdir -p "$(dirname "$OUT")"
pg pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" > "$OUT"
[ -s "$OUT" ] || { echo "backup empty, aborting" >&2; rm -f "$OUT"; exit 1; }
echo "backup ok: $OUT ($(wc -c < "$OUT") bytes)"
