#!/usr/bin/env bash
# Confirm the running droplet process resolved its persistent paths correctly.
# This is the check that matters: a wrong DATA_DIR is silent until a deploy
# wipes everything.
set -u
cd "$(dirname "$0")" || exit 1

bash ./droplet.sh '
cd /home/deploy/1-percent-more-fluent

echo "=== force a database write (unknown cookie makes getUserId query) ==="
curl -s -o /dev/null -w "  status %{http_code}\n" -H "Cookie: fluent_uid=probe" http://127.0.0.1:3100/

echo "=== where did the database land ==="
find /home/deploy/1-percent-more-fluent -name "*.sqlite*" 2>/dev/null | sed "s|^|  |"

echo "=== inside the build output? (must be empty) ==="
find .next/standalone -name "*.sqlite*" -o -name "audio" -type d 2>/dev/null | sed "s|^|  |"

echo "=== environment the process actually has ==="
PID=$(pgrep -f "standalone/server.j[s]" | head -1)
if [ -n "$PID" ]; then
  tr "\0" "\n" < /proc/$PID/environ | grep -E "^(DATA_DIR|AUDIO_DIR|PORT|NODE_ENV|HOSTNAME)=" | sed "s|^|  |"
else
  echo "  process not found"
fi
'
