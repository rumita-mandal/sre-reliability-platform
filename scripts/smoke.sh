#!/bin/sh
# Post-deploy smoke test. Usage: BASE_URL=https://my-app.onrender.com sh scripts/smoke.sh
# Exits non-zero on the first failing check so CI/CD can gate or roll back.
set -eu

BASE_URL="${BASE_URL:-http://localhost:3000}"
BASE_URL="${BASE_URL%/}"
RETRIES="${RETRIES:-10}"
SLEEP_SECONDS="${SLEEP_SECONDS:-3}"

check() {
  path="$1"
  expected="$2"
  attempt=1
  while [ "$attempt" -le "$RETRIES" ]; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE_URL$path" || echo "000")
    if [ "$code" = "$expected" ]; then
      echo "PASS  $path -> $code"
      return 0
    fi
    echo "WAIT  $path -> $code (expected $expected), attempt $attempt/$RETRIES"
    attempt=$((attempt + 1))
    sleep "$SLEEP_SECONDS"
  done
  echo "FAIL  $path never returned $expected"
  exit 1
}

echo "Smoke testing $BASE_URL"
check /healthz 200
check /readyz 200
check /version 200
check /metrics 200
check /api/items 200
check /does-not-exist 404
echo "All smoke tests passed"
