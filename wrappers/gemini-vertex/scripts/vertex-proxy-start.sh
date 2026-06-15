#!/usr/bin/env bash
set -euo pipefail

PORT="${VERTEX_PROXY_PORT:-8091}"
HOST="${VERTEX_PROXY_HOST:-127.0.0.1}"
PROXY_SCRIPT="${VERTEX_PROXY_SCRIPT:-./wrappers/gemini-vertex/vertex-token-proxy.mjs}"
RUN_DIR="${VERTEX_PROXY_RUN_DIR:-./.codebridge/run}"
LOG_DIR="${VERTEX_PROXY_LOG_DIR:-./.codebridge/logs}"
PID_FILE="$RUN_DIR/vertex-token-proxy.pid"
LOG_FILE="$LOG_DIR/vertex-token-proxy.log"
ERR_FILE="$LOG_DIR/vertex-token-proxy.err"
HEALTH_URL="http://${HOST}:${PORT}/healthz"

mkdir -p "$RUN_DIR" "$LOG_DIR"

is_healthy() {
  curl --max-time 2 -fsS "$HEALTH_URL" >/dev/null 2>&1
}

if is_healthy; then
  echo "vertex proxy already healthy at $HEALTH_URL"
  exit 0
fi

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${OLD_PID}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "stopping stale vertex proxy pid $OLD_PID"
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
    kill -9 "$OLD_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

if pgrep -af 'vertex-token-proxy.mjs' >/dev/null 2>&1; then
  echo "killing orphaned vertex-token-proxy.mjs process(es)"
  pkill -f 'vertex-token-proxy.mjs' || true
  sleep 1
fi

nohup node "$PROXY_SCRIPT" >>"$LOG_FILE" 2>>"$ERR_FILE" < /dev/null &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"
echo "started vertex proxy pid $NEW_PID"

for _ in $(seq 1 10); do
  if is_healthy; then
    echo "vertex proxy healthy at $HEALTH_URL"
    exit 0
  fi
  sleep 1
done

echo "vertex proxy failed to become healthy; see $LOG_FILE and $ERR_FILE" >&2
exit 1
