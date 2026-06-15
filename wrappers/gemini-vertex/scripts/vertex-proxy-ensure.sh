#!/usr/bin/env bash
set -euo pipefail

PORT="${VERTEX_PROXY_PORT:-8091}"
HOST="${VERTEX_PROXY_HOST:-127.0.0.1}"
HEALTH_URL="http://${HOST}:${PORT}/healthz"
LOCK_DIR="${VERTEX_PROXY_LOCK_DIR:-./.codebridge/run}"
LOCK_FILE="$LOCK_DIR/vertex-proxy-ensure.lock"
START_SCRIPT="${VERTEX_PROXY_START_SCRIPT:-./wrappers/gemini-vertex/scripts/vertex-proxy-start.sh}"

mkdir -p "$LOCK_DIR"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "vertex-proxy-ensure: another ensure run is already active"
  exit 0
fi

if curl --max-time 2 -fsS "$HEALTH_URL" >/dev/null 2>&1; then
  echo "vertex-proxy-ensure: healthy"
  exit 0
fi

echo "vertex-proxy-ensure: unhealthy, restarting"
exec "$START_SCRIPT"
