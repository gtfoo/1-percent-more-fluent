#!/usr/bin/env bash
#
# Run the standalone build locally exactly as systemd will, and check the
# things that only break in that mode.
#
#   bash scripts/try-standalone.sh
#
# Worth having: `next dev` does not chdir, so a whole class of production-only
# path bugs is invisible until the standalone server actually runs.
set -u
cd "$(dirname "$0")/.." || exit 1
source ~/.nvm/nvm.sh >/dev/null 2>&1
nvm use 20 >/dev/null 2>&1

PORT=3009
ROOT=$(pwd)

bash "$(dirname "$0")/kill-standalone.sh" "$PORT" >/dev/null 2>&1
exit 0
sleep 1

set -a
# shellcheck disable=SC1091
[ -f .env.local ] && . ./.env.local
set +a

DATA_DIR="$ROOT/data" PORT=$PORT HOSTNAME=127.0.0.1 \
  setsid nohup node .next/standalone/server.js > /tmp/fluent-standalone.log 2>&1 < /dev/null &
disown

for _ in $(seq 1 30); do
  sleep 1
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)" = "200" ] && break
done

echo "--- home ---"
curl -s -o /dev/null -w "status %{http_code}\n" "http://127.0.0.1:$PORT/"

echo "--- existing profile reachable (proves DATA_DIR points at the real db) ---"
curl -s -H "Cookie: fluent_uid=5679d945-1ccd-4003-969c-83cfcfdcd7d1" \
  "http://127.0.0.1:$PORT/" |
  grep -o "Simplified Chinese\|Spanish\|HSK [0-9]\|Find my level" | sort -u | head -4

echo "--- audio, with a range request ---"
CLIP=$(ls data/audio 2>/dev/null | grep -m1 'mp3$')
if [ -n "$CLIP" ]; then
  curl -s -o /dev/null -D - -H "Range: bytes=0-99" "http://127.0.0.1:$PORT/audio/$CLIP" |
    grep -Ei "HTTP/|content-range"
else
  echo "  (no cached clips to test)"
fi

echo "--- stray database inside the build output? ---"
find .next/standalone -name "*.sqlite*" 2>/dev/null | head -3
echo "  (nothing listed above = good)"

echo "--- server log ---"
tail -4 /tmp/fluent-standalone.log

pkill -f "standalone/server.j[s]" >/dev/null 2>&1
