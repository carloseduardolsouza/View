#!/usr/bin/env bash
# Self-signed certificate for local/staging TLS tests -> infra/certs/{fullchain,privkey}.pem. NOT for production
# (browsers warn; use a real CA such as Let's Encrypt or your institution's PKI). Usage: scripts/make-dev-cert.sh [hostname]
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash must not rewrite the /CN=... argument
HOST="${1:-localhost}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/infra/certs"
mkdir -p "$DIR"
run() {
  if command -v openssl >/dev/null 2>&1; then openssl "$@"
  else MSYS_NO_PATHCONV=1 wsl openssl "$@"; fi
}
cd "$DIR"
run req -x509 -newkey rsa:2048 -nodes -days 365 -keyout privkey.pem -out fullchain.pem \
  -subj "/CN=$HOST" -addext "subjectAltName=DNS:$HOST,DNS:localhost,IP:127.0.0.1"
chmod 600 privkey.pem 2>/dev/null || true
echo "certificate written to $DIR (valid 365 days, CN=$HOST)"
