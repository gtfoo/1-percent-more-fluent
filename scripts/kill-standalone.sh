#!/usr/bin/env bash
# Stop any locally-running standalone server on the try-standalone port.
set -u
PORT="${1:-3009}"
PIDS=$(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K[0-9]+' | sort -u)
if [ -z "$PIDS" ]; then
  echo "nothing listening on $PORT"
  exit 0
fi
for pid in $PIDS; do
  echo "killing $pid"
  kill -9 "$pid" 2>/dev/null || true
done
sleep 1
ss -ltn 2>/dev/null | grep -q ":$PORT " && echo "STILL LISTENING on $PORT" || echo "$PORT free"
