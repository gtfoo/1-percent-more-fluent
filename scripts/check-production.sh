#!/usr/bin/env bash
# Is the deployed site actually behaving? Free checks only - nothing here spends
# a token or a character of speech.
#
#   bash scripts/check-production.sh [piece-id]
#
# Written as a script rather than a one-liner because the one-liner version lied:
# a curl whose output file never got written left grep reading a missing file,
# and the missing file read as "the thing I wanted is absent". Every check below
# fails loudly instead.
set -u
cd "$(dirname "$0")/.." || exit 1

BASE="${BASE:-https://1-percent-more-fluent.gtfoo.com}"
PIECE="${1:-}"
OUT=$(mktemp)
fail=0

say() { printf '%-34s %s\n' "$1" "$2"; }

# --- The site is up ---------------------------------------------------------
CODE=$(curl -s -o "$OUT" -m 25 -w '%{http_code}' "$BASE/")
if [ "$CODE" = "200" ] && [ -s "$OUT" ]; then
  say "site" "$CODE, $(wc -c < "$OUT") bytes"
else
  fail=1
  say "site" "FAIL $CODE, $(wc -c < "$OUT") bytes"
fi

# --- What a first-time visitor sees -----------------------------------------
# No cookie was sent, so this IS the fresh-visitor page.
if grep -q "at the level you" "$OUT"; then
  say "landing heading" "$(grep -o 'Read [^<]*at the level[^<]*' "$OUT" | head -1)"
else
  fail=1
  say "landing heading" "FAIL not found"
fi

if grep -q "Re-test my level" "$OUT"; then
  fail=1
  say "header link for a stranger" "FAIL shown before they have a level"
else
  say "header link for a stranger" "hidden, correct"
fi

if grep -q "Speech synthesised" "$OUT"; then
  fail=1
  say "speech bill for a stranger" "FAIL leaking the operator's spend"
else
  say "speech bill for a stranger" "hidden, correct"
fi

# --- The word-audio guard ---------------------------------------------------
if [ -n "$PIECE" ]; then
  echo
  echo "--- word-audio guard (rejects before spending) ---"
  BASE="$BASE" bash scripts/check-word-tts-guard.sh "$PIECE" || fail=1
fi

rm -f "$OUT"
echo
if [ "$fail" -eq 0 ]; then echo "production looks right"; else echo "SOMETHING IS WRONG"; fi
exit "$fail"
