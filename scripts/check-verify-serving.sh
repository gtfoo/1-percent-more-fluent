#!/usr/bin/env bash
# Does verify-serving.sh actually catch a broken deploy?
#
#   bash scripts/check-verify-serving.sh
#
# A check that only ever passes is worse than no check: it converts "nobody
# looked" into "something looked and said fine". So this breaks the site in the
# exact way a half-done deploy breaks it - by removing the copied static
# directory - and asserts the check fails.
set -u
cd "$(dirname "$0")/.." || exit 1

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1090
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use 20 >/dev/null

PORT=3006
BASE="http://127.0.0.1:$PORT"
pass=0; fail=0
ok() { if [ "$2" = 1 ]; then echo "ok   $1"; pass=$((pass+1)); else echo "FAIL $1  ${3:-}"; fail=$((fail+1)); fi }

stop() {
  for pid in $(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K[0-9]+' | sort -u); do
    kill -9 "$pid" 2>/dev/null || true
  done
}
cleanup() {
  stop
  [ -d /tmp/fluent-static-backup ] && {
    rm -rf .next/standalone/.next/static
    mv /tmp/fluent-static-backup .next/standalone/.next/static
  }
  echo
  echo "(restored; run 'bash scripts/dev.sh' for the normal dev server)"
}
trap cleanup EXIT

for p in 3003 3004 3005; do
  for pid in $(ss -ltnp 2>/dev/null | grep ":$p " | grep -oP 'pid=\K[0-9]+' | sort -u); do
    kill -9 "$pid" 2>/dev/null || true
  done
done
stop
sleep 1

if [ ! -d .next/standalone ]; then
  echo "==> building first"
  rm -rf .next
  npm run build >/tmp/verify-build.log 2>&1 || { echo "build failed"; tail -20 /tmp/verify-build.log; exit 1; }
  cp -r .next/static .next/standalone/.next/static
  cp -r public .next/standalone/public
fi

start_server() {
  DATA_DIR="$PWD/data" AUDIO_DIR="$PWD/data/audio" NODE_ENV=production \
    PORT=$PORT HOSTNAME=127.0.0.1 \
    setsid nohup node .next/standalone/server.js >/tmp/verify-server.log 2>&1 < /dev/null &
  disown
  for _ in $(seq 1 30); do
    sleep 1
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/" || true)" = "200" ] && return 0
  done
  return 1
}

echo "==> a correctly assembled deploy"
start_server || { echo "server did not start"; tail -10 /tmp/verify-server.log; exit 1; }
if bash scripts/verify-serving.sh "$BASE" >/tmp/verify-good.txt 2>&1; then
  ok "passes when the site is fine" 1
else
  ok "passes when the site is fine" 0 "$(cat /tmp/verify-good.txt)"
fi
sed 's/^/     /' /tmp/verify-good.txt

echo
echo "==> the same deploy with the static copy missing"
stop
mv .next/standalone/.next/static /tmp/fluent-static-backup
start_server || { echo "server did not start"; exit 1; }
if bash scripts/verify-serving.sh "$BASE" >/tmp/verify-bad.txt 2>&1; then
  ok "FAILS when the assets are missing" 0 "it passed - the check is useless"
else
  ok "fails when the assets are missing" 1
fi
grep -c '^!!' /tmp/verify-bad.txt | sed 's/^/     complaints: /'
head -3 /tmp/verify-bad.txt | sed 's/^/     /'

echo
[ "$fail" -gt 0 ] && { echo "$fail failing"; exit 1; }
echo "$pass checks passed - a broken deploy will now fail loudly"
