#!/usr/bin/env bash
# Start (or restart) the dev server in WSL, detached, logging to /tmp.
#
# The app must run inside WSL: node_modules is on the ext4 filesystem, and
# better-sqlite3 is compiled for Linux. Driving `npm` from Windows across
# the \\wsl.localhost share does not work.
#
# Port 3003 matches the "fluent" entry in gtfoo/.claude/launch.json, so this
# script and the preview tooling never fight over a socket. 3000/3001/3002
# already belong to gtfoo, carpark-sg and role-match.
#
#   bash scripts/dev.sh          # restart
#   bash scripts/dev.sh --clean  # also wipe the Turbopack cache first
set -u

PORT=3003
PROJECT=/home/gtfoo/Git/1-percent-more-fluent

cd "$(dirname "$0")/.." || exit 1

# shellcheck disable=SC1090
source ~/.nvm/nvm.sh >/dev/null 2>&1
nvm use 20 >/dev/null 2>&1

LOG=/tmp/fluent-dev.log

# Kill by PORT rather than by command-line pattern. Two traps here, both hit:
# Next rewrites its process title to "next-server (vX)" once running, so a
# pattern matching the launch command silently matches nothing; and a pattern
# broad enough to catch it also matches this script's own command line, so
# pkill terminates the shell that invoked it.
for pid in $(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K[0-9]+' | sort -u); do
  kill -9 "$pid" 2>/dev/null || true
done
sleep 1

# Turbopack's incremental cache does not survive being killed mid-write, and a
# corrupted one surfaces as a 500 on every route with an SST file error in the
# log rather than as anything obviously cache-shaped.
if [ "${1:-}" = "--clean" ]; then
  echo "clearing .next"
  rm -rf .next
fi

setsid nohup npm run dev -- -H 0.0.0.0 -p "$PORT" >"$LOG" 2>&1 < /dev/null &
disown

for _ in $(seq 1 60); do
  sleep 1
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)
  if [ "$code" = "200" ]; then
    echo "ready: HTTP $code on port $PORT"
    exit 0
  fi
  if [ "$code" = "500" ]; then
    echo "HTTP 500 - likely a corrupted Turbopack cache; retry with --clean"
    tail -20 "$LOG"
    exit 1
  fi
done

echo "did not become ready; log follows:"
tail -40 "$LOG"
exit 1
