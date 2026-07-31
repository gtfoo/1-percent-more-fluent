#!/usr/bin/env bash
# Start (or restart) the dev server in WSL, detached, logging to /tmp.
#
# The app must run inside WSL: node_modules is on the ext4 filesystem, and
# better-sqlite3 is compiled for Linux. Driving `npm` from Windows across
# the \\wsl.localhost share does not work.
set -u

cd "$(dirname "$0")/.." || exit 1

# shellcheck disable=SC1090
source ~/.nvm/nvm.sh >/dev/null 2>&1
nvm use 20 >/dev/null 2>&1

LOG=/tmp/comprensible-dev.log

pkill -f 'next dev' >/dev/null 2>&1
pkill -f 'next-server' >/dev/null 2>&1
sleep 1

setsid nohup npm run dev >"$LOG" 2>&1 < /dev/null &
disown

for _ in $(seq 1 40); do
  sleep 1
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true)
  if [ "$code" = "200" ]; then
    echo "ready: HTTP $code"
    exit 0
  fi
done

echo "did not become ready; log follows:"
tail -40 "$LOG"
exit 1
