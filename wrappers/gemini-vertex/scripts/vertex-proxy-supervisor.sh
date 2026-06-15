#!/bin/bash
# Simple restart-on-crash supervisor for vertex-token-proxy
# Restarts on exit with a 2-second backoff, caps at 5 rapid restarts

MAX_RAPID=5
RAPID_WINDOW=30
PROXY="./wrappers/gemini-vertex/vertex-token-proxy.mjs"
LOG="./.codebridge/logs/vertex-proxy.log"

declare -a timestamps=()

while true; do
  now=$(date +%s)
  
  # Prune old timestamps outside rapid window
  fresh=()
  for ts in "${timestamps[@]}"; do
    if (( now - ts < RAPID_WINDOW )); then
      fresh+=("$ts")
    fi
  done
  timestamps=("${fresh[@]}")
  
  if (( ${#timestamps[@]} >= MAX_RAPID )); then
    echo "$(date -Iseconds) SUPERVISOR: $MAX_RAPID crashes in ${RAPID_WINDOW}s - giving up" >> "$LOG"
    exit 1
  fi
  
  timestamps+=("$now")
  echo "$(date -Iseconds) SUPERVISOR: starting vertex-token-proxy" >> "$LOG"
  node "$PROXY" >> "$LOG" 2>&1
  EXIT_CODE=$?
  echo "$(date -Iseconds) SUPERVISOR: proxy exited with code $EXIT_CODE - restarting in 2s" >> "$LOG"
  sleep 2
done
