#!/usr/bin/env bash
# Does a stored piece actually render? Prints status, script and lang markers.
#
#   BASE=https://... bash scripts/check-read-page.sh <piece-id>
set -u
cd "$(dirname "$0")/.." || exit 1

BASE="${BASE:-http://127.0.0.1:3003}"
ID="${1:-}"
[ -n "$ID" ] || { echo "usage: check-read-page.sh <piece-id>" >&2; exit 1; }

OUT=$(mktemp)
CODE=$(curl -s -o "$OUT" -w '%{http_code}' "$BASE/read/$ID")
echo "http    : $CODE"
echo "bytes   : $(wc -c < "$OUT")"

if LC_ALL=C grep -qP '[\xe4-\xe9][\x80-\xbf][\x80-\xbf]' "$OUT"; then
  echo "script  : Han present"
else
  echo "script  : no Han"
fi

echo "lang    : $(grep -o 'lang="[^"]*"' "$OUT" | sort -u | tr '\n' ' ')"
# grep -o then count lines: rendered HTML is one long line, so `grep -c` would
# report 1 no matter how many spans there are.
echo "words   : $(grep -o 'class="word' "$OUT" | wc -l) word spans"
echo "terms   : $(grep -o 'class="word[^"]* term' "$OUT" | wc -l) marked as terms"
rm -f "$OUT"
