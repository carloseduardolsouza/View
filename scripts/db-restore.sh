#!/usr/bin/env bash
# Usage: scripts/db-restore.sh <dumpfile> [target_db]
# Restores into target_db (default: a NEW database view_restore_<ts>, created for you). It never drops or
# overwrites the database in DATABASE_URL: to replace production, restore to a new name and swap
# (see docs/operations.md). Set RESTORE_DROP_TARGET=1 to drop target_db first (only for throwaway DBs).
. "$(dirname "$0")/_pg.sh"
DUMP="${1:?dump file}"; [ -s "$DUMP" ] || { echo "no such dump: $DUMP" >&2; exit 1; }
TARGET="${2:-view_restore_$(date -u +%Y%m%d%H%M%S)}"
[[ "$TARGET" =~ ^[a-z0-9_]+$ ]] || { echo "invalid db name" >&2; exit 1; }
[ "$TARGET" != "$DB_NAME" ] || { echo "refusing to restore over the live database $DB_NAME" >&2; exit 1; }
ADMIN="$(url_for postgres)"
[ "${RESTORE_DROP_TARGET:-}" = 1 ] && pg psql "$ADMIN" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$TARGET\""
pg psql "$ADMIN" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$TARGET\""
pg pg_restore --no-owner --exit-on-error --dbname="$(url_for "$TARGET")" < "$DUMP"
echo "restored into database: $TARGET"
