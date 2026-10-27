# Sourced by the db scripts. Defines pg <tool> [args]: uses the local client if installed,
# otherwise a throwaway postgres container through WSL (dev machines without psql).
# Requires DATABASE_URL in the environment (or .env at the repo root).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -z "${DATABASE_URL:-}" ] && [ -f "$ROOT/.env" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ROOT/.env" | head -1 | cut -d= -f2-)"
fi
: "${DATABASE_URL:?DATABASE_URL not set}"
# match the server major version (pg_restore rejects dumps from a newer pg_dump than the target server)
PG_IMAGE="${PG_IMAGE:-postgres:16}"
# DB name of the URL, and the same URL pointing at another database
DB_NAME="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[^/]+//[^/]+/([^?]+).*#\1#')"
url_for() { printf '%s' "$DATABASE_URL" | sed -E "s#(^[^/]+//[^/]+/)[^?]+#\1$1#"; }
pg() {
  local tool="$1"; shift
  if command -v "$tool" >/dev/null 2>&1; then "$tool" "$@"
  else
    # --network host: inside WSL, localhost reaches the published Postgres port. Files go through stdin/stdout.
    MSYS_NO_PATHCONV=1 wsl docker run --rm -i --network host "$PG_IMAGE" "$tool" "$@"
  fi
}
