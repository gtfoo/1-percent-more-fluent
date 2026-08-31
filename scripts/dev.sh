#!/usr/bin/env bash
# Start (or restart) the dev server in WSL, detached, logging to /tmp.
#
# The app must run inside WSL: node_modules is on the ext4 filesystem, and
# better-sqlite3 is compiled for Linux. Driving `npm` from Windows across
# the \\wsl.localhost share does not work.
#
# Port 3100 is this app's allocation in ~/Git/INFRA.md, and the port production
# already serves on - local and the box now agree.
#
# It was 3003 for months, which is INDIE-DEGREE's. Nothing ever broke, because
# a port collision is only visible when both run at once and the survivor is
# whichever started first. The comment here used to justify 3003 by pointing at
# the "fluent" entry in gtfoo/.claude/launch.json - someone else's repo, which
# was itself wrong and has since been corrected. This repo now carries its own
# .claude/launch.json so the dev-server config lives where the dev server does.
#
# The auth checks start their own throwaway servers on 3101 and 3102, so every
# socket this repo binds is inside its own block. 3004 was one of them until
# today; that is rain-sg's.
#
#   bash scripts/dev.sh          # restart
#   bash scripts/dev.sh --clean  # also wipe the Turbopack cache first
set -u

PORT=3100
PROJECT=/home/gtfoo/Git/1-percent-more-fluent

cd "$(dirname "$0")/.." || exit 1

# shellcheck disable=SC1090
source ~/.nvm/nvm.sh >/dev/null 2>&1
nvm use "$(cat "$(dirname "$0")/../.nvmrc")" >/dev/null 2>&1

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
