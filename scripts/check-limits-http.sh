#!/usr/bin/env bash
# Prove the ceiling actually fires, over real HTTP.
#
#   bash scripts/dev.sh && bash scripts/check-limits-http.sh
#
# check-limits.ts covers the arithmetic offline. This covers the thing it
# cannot: that the guard is wired into the route AHEAD of everything else, so a
# request that would have cost money is refused before it costs any.
#
# Costs nothing. It drives /api/placement, which is the cheapest limited route
# (no LLM, no TTS) and has the lowest ceiling, so proving it takes eleven
# requests rather than four hundred. It sends a fixture cookie so the run does
# not mint a dozen throwaway readers, and it clears its own counters afterwards
# so a second run starts from zero.
set -u

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null
fi

PORT=3003
BASE="http://127.0.0.1:$PORT"
# Ten per hour per address; see PLANS.placement.
LIMIT=10

pass=0
fail=0
ok() { if [ "$2" = "1" ]; then echo "ok   $1"; pass=$((pass+1)); else echo "FAIL $1  ${3:-}"; fail=$((fail+1)); fi }

if ! curl -s -o /dev/null "$BASE/"; then
  echo "no dev server on $PORT - run: bash scripts/dev.sh"
  exit 1
fi

USER_ID=$(npx tsx scripts/fixture-progress.ts add | tail -1)
cleanup() {
  npx tsx scripts/fixture-progress.ts remove >/dev/null 2>&1 || true
  npx tsx scripts/fixture-limits.ts clear >/dev/null 2>&1 || true
}
trap cleanup EXIT
npx tsx scripts/fixture-limits.ts clear >/dev/null

post() {
  curl -s -o /dev/null -w '%{http_code}' -X POST \
    -b "fluent_uid=$USER_ID" -H 'Content-Type: application/json' \
    ${2:+-H "X-Forwarded-For: $2"} \
    -d '{"shown":[],"known":[]}' "$BASE$1"
}

echo "--- the first requests go through ---"
allowed=1
for _ in $(seq 1 "$LIMIT"); do
  code=$(post /api/placement)
  # Any non-429 is "the limiter let it past", which is what is being asserted.
  # Whether the body then validates is the route's business, not this test's.
  [ "$code" = "429" ] && allowed=0
done
[ "$allowed" = "1" ] && ok "$LIMIT requests are served" 1 || ok "$LIMIT requests are served" 0

echo
echo "--- and then it stops ---"
code=$(post /api/placement)
[ "$code" = "429" ] && ok "the next one is refused" 1 || ok "the next one is refused" 0 "HTTP $code"
retry=$(curl -s -D - -o /dev/null -X POST -b "fluent_uid=$USER_ID" \
  -H 'Content-Type: application/json' -d '{"shown":[],"known":[]}' "$BASE/api/placement" \
  | grep -i '^retry-after:' | tr -d '\r' | awk '{print $2}')
[ -n "$retry" ] && [ "$retry" -gt 0 ] 2>/dev/null \
  && ok "and says how long to wait" 1 || ok "and says how long to wait" 0 "got '$retry'"

echo
echo "--- a forged header does not buy a fresh allowance ---"
# The bypass this is all built to prevent. In production Caddy APPENDS the peer
# it saw, so a caller's own X-Forwarded-For lands to the LEFT of the real one
# and is ignored. Here that means the first hop is decoration and the address is
# still spent.
code=$(post /api/placement "198.51.100.7, 127.0.0.1")
[ "$code" = "429" ] && ok "still refused behind a forged first hop" 1 \
  || ok "still refused behind a forged first hop" 0 "HTTP $code"

echo
echo "--- an unlimited route is untouched ---"
# The ceiling is on what costs money. Reading a page must not be rationed, and
# a limiter applied too broadly is its own outage.
code=$(curl -s -o /dev/null -w '%{http_code}' -b "fluent_uid=$USER_ID" "$BASE/progress")
[ "$code" = "200" ] && ok "the pages still serve" 1 || ok "the pages still serve" 0 "HTTP $code"

echo
if [ "$fail" -gt 0 ]; then echo "$fail failing"; exit 1; fi
echo "$pass checks passed"
