#!/usr/bin/env bash
# Stop whatever is listening on a port.
#
# By PORT, deliberately, not by command-line pattern. Next rewrites its process
# title from "node .next/standalone/server.js" to "next-server (v16.2.10)" once
# it is up, so `pkill -f standalone/server.js` silently matches nothing. That
# exact mistake left a stray server holding 3100 on the droplet and put the new
# systemd unit into an EADDRINUSE restart loop.
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
