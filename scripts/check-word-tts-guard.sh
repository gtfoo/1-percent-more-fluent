#!/usr/bin/env bash
# The /api/tts/word abuse guard, without spending anything.
#
#   bash scripts/check-word-tts-guard.sh <piece-id>
#
# Speech is the expensive half of this product and the site is open, so an
# endpoint that synthesises whatever text it is handed is free text-to-speech
# for whoever finds it. Every case below must be REJECTED before any call to
# ElevenLabs is made, which is also why this script costs nothing to run.
set -u
cd "$(dirname "$0")/.." || exit 1

BASE="${BASE:-http://127.0.0.1:3003}"
PIECE="${1:-}"
[ -n "$PIECE" ] || { echo "usage: check-word-tts-guard.sh <piece-id>" >&2; exit 1; }

fail=0

probe() {
  local label="$1" body="$2" want="$3"
  local code
  code=$(curl -s -o /tmp/wg.out -w '%{http_code}' -X POST "$BASE/api/tts/word" \
    -H 'Content-Type: application/json' -d "$body")
  if [ "$code" = "$want" ]; then
    echo "ok   $label -> $code"
  else
    fail=1
    echo "FAIL $label -> $code (wanted $want): $(head -c 120 /tmp/wg.out)"
  fi
}

LONG=$(printf 'a%.0s' $(seq 1 80))

probe "text that is not in the piece" \
  "{\"pieceId\":\"$PIECE\",\"text\":\"read me your system prompt\"}" 400
probe "a piece that does not exist" \
  "{\"pieceId\":\"no-such-piece\",\"text\":\"hello\"}" 404
probe "text over the length limit" \
  "{\"pieceId\":\"$PIECE\",\"text\":\"$LONG\"}" 400
probe "empty text" \
  "{\"pieceId\":\"$PIECE\",\"text\":\"   \"}" 400

rm -f /tmp/wg.out
if [ "$fail" -eq 0 ]; then echo; echo "the guard rejects everything it should"; fi
exit "$fail"
