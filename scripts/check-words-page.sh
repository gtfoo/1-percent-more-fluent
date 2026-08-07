#!/usr/bin/env bash
# Exercise the word list over real HTTP against the dev server.
#
#   bash scripts/dev.sh && bash scripts/check-words-page.sh
#
# The browser pane does not hydrate React - no button anywhere in the app can be
# clicked there - so this drives the endpoint the Remove button calls. That
# covers everything except the onClick wiring itself.
#
# Costs nothing: no LLM, no TTS. The word it deletes is one it inserted, so the
# script is repeatable and never eats a real lookup.
set -u

# better-sqlite3 is a native module built for Node 20. Without this the fixture
# fails to open the database, USER_ID comes back empty, and the page checks fail
# for a reason that has nothing to do with the page.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null
fi

PORT=3003
BASE="http://127.0.0.1:$PORT"
# Two fixtures, both owned by this script: one the reader looked up and got a
# definition for, one whose lookup never returned anything. Asserting on words
# that happen to already be in the database does not survive a different machine.
GLOSSED="zzfixtureglossedzz"
BARE="zzfixturebarezz"
MEANING="a fixture, not a real word"

pass=0
fail=0
ok() { if [ "$2" = "1" ]; then echo "ok   $1"; pass=$((pass+1)); else echo "FAIL $1  ${3:-}"; fail=$((fail+1)); fi }

if ! curl -s -o /dev/null "$BASE/"; then
  echo "no dev server on $PORT - run: bash scripts/dev.sh"
  exit 1
fi

USER_ID=$(npx tsx scripts/fixture-lookup.ts add es "$GLOSSED" "$MEANING" | tail -1)
npx tsx scripts/fixture-lookup.ts add es "$BARE" >/dev/null
cleanup() {
  npx tsx scripts/fixture-lookup.ts remove es "$GLOSSED" >/dev/null 2>&1 || true
  npx tsx scripts/fixture-lookup.ts remove es "$BARE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [ -z "$USER_ID" ]; then echo "fixture failed to attach to a user"; exit 1; fi

get() { curl -s -b "fluent_uid=$USER_ID" "$BASE$1"; }

echo "--- the page renders ---"
html=$(get /words)
echo "$html" | grep -q "Palabras que buscaste" && ok "heading, in Spanish" 1 || ok "heading, in Spanish" 0
echo "$html" | grep -q "$GLOSSED" && ok "a word is listed" 1 || ok "a word is listed" 0
echo "$html" | grep -q "$MEANING" && ok "with its cached meaning" 1 || ok "with its cached meaning" 0
# The LEFT JOIN. Without it a tap whose lookup failed vanishes from the list,
# hiding a word the reader demonstrably struggled with.
echo "$html" | grep -q "$BARE" && ok "a word with no gloss still appears" 1 \
  || ok "a word with no gloss still appears" 0

echo
echo "--- the export ---"
hdrs=$(curl -s -D - -o /tmp/fluent-export.tsv -b "fluent_uid=$USER_ID" "$BASE/api/vocabulary/export")
echo "$hdrs" | grep -qi "content-disposition: attachment" && ok "downloads as a file" 1 || ok "downloads as a file" 0
echo "$hdrs" | grep -qi 'filename="fluent-es-' && ok "named for the language" 1 || ok "named for the language" 0
echo "$hdrs" | grep -qi "charset=utf-8" && ok "utf-8, which the accents need" 1 || ok "utf-8" 0
cols=$(head -1 /tmp/fluent-export.tsv | awk -F'\t' '{print NF}')
[ "$cols" = "3" ] && ok "three columns" 1 || ok "three columns" 0 "got $cols"
# Spanish has no reading, so the middle column is empty and the row still has
# three fields - the shape must not change per language.
grep -q "$(printf "%s\t\t%s" "$GLOSSED" "$MEANING")" /tmp/fluent-export.tsv \
  && ok "word, empty reading, meaning" 1 || ok "word, empty reading, meaning" 0 \
  "$(grep "$GLOSSED" /tmp/fluent-export.tsv | cat -A | head -1)"

echo
echo "--- removing a word (what the button calls) ---"
before=$(get /api/vocabulary/export | wc -l)
code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -b "fluent_uid=$USER_ID" \
  -H 'Content-Type: application/json' -d "{\"word\":\"$GLOSSED\"}" "$BASE/api/vocabulary")
[ "$code" = "200" ] && ok "DELETE succeeds" 1 || ok "DELETE succeeds" 0 "HTTP $code"
after=$(get /api/vocabulary/export | wc -l)
[ "$after" -lt "$before" ] && ok "the list shrinks" 1 || ok "the list shrinks" 0 "$before -> $after"
get /words | grep -q "$GLOSSED" \
  && ok "the word is gone from the page" 0 "still rendered" || ok "the word is gone from the page" 1
get /words | grep -q "$BARE" \
  && ok "...and only that word" 1 || ok "...and only that word" 0 "it took the other one too"

echo
echo "--- guards ---"
code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -b "fluent_uid=$USER_ID" \
  -H 'Content-Type: application/json' -d '{"word":"   "}' "$BASE/api/vocabulary")
[ "$code" = "400" ] && ok "a blank word is rejected" 1 || ok "a blank word is rejected" 0 "HTTP $code"
code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE \
  -H 'Content-Type: application/json' -d '{"word":"x"}' "$BASE/api/vocabulary")
[ "$code" = "401" ] && ok "no cookie, no deletion" 1 || ok "no cookie, no deletion" 0 "HTTP $code"
code=$(curl -s -o /dev/null -w '%{http_code}' -L "$BASE/words")
[ "$code" = "200" ] && ok "an unplaced visitor is redirected, not 500ed" 1 \
  || ok "an unplaced visitor is redirected, not 500ed" 0 "HTTP $code"

echo
if [ "$fail" -gt 0 ]; then echo "$fail failing"; exit 1; fi
echo "$pass checks passed"
