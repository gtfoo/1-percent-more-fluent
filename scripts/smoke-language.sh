#!/usr/bin/env bash
# Generate a piece for a profile in each language and check the script it comes
# back in. This is the check that was missing: every other signal was green
# while a Chinese learner was being served Spanish.
#
#   bash scripts/smoke-language.sh            # local dev on :3003
#   BASE=https://... bash scripts/smoke-language.sh
set -u
cd "$(dirname "$0")/.." || exit 1
source ~/.nvm/nvm.sh >/dev/null 2>&1
nvm use 20 >/dev/null 2>&1

BASE="${BASE:-http://127.0.0.1:3003}"

# Driven from the registry, so a new language is smoke-tested the moment it is
# registered rather than the day somebody remembers to edit this list.
LANGS=$(npx --yes tsx -e 'import("../src/lib/languages").then(m=>console.log(m.languageCodes().join(" ")))' 2>/dev/null \
        || echo "es zh-CN id")

for lang in $LANGS; do
  echo "=== $lang ==="
  JAR=$(mktemp)

  # A fresh anonymous user, placed in this language. Marking nothing keeps the
  # level low, which also keeps generation cheap.
  ITEMS=$(curl -s -c "$JAR" -b "$JAR" "$BASE/api/placement?language=$lang" \
    | npx --yes tsx -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(JSON.stringify(d.items))' 2>/dev/null)

  curl -s -c "$JAR" -b "$JAR" -X POST "$BASE/api/placement" \
    -H 'Content-Type: application/json' \
    -d "{\"shown\":$ITEMS,\"known\":[],\"readbackLevel\":28,\"language\":\"$lang\"}" > /dev/null

  ID=$(curl -s -c "$JAR" -b "$JAR" -X POST "$BASE/api/generate" \
    -H 'Content-Type: application/json' \
    -d '{"format":"story","topic":"a lost key","length":"short"}' \
    | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

  if [ -z "$ID" ]; then
    echo "  FAIL generation returned no id"
    FAILED=1
    rm -f "$JAR"
    continue
  fi

  BODY=$(curl -s -c "$JAR" -b "$JAR" "$BASE/read/$ID")

  # Which language did the model actually write in?
  #
  # This used to identify a language by its SCRIPT - Han bytes meant Chinese,
  # Spanish diacritics meant Spanish, anything else was a failure. That cannot
  # work for a third language written in plain ASCII Latin: Indonesian could
  # never pass, and worse, the one thing this script exists to catch - being
  # served the wrong language - is invisible, because Indonesian and English
  # are the same script.
  #
  # So: count marker words instead. Common function words, chosen to be
  # unambiguous across the three, and required in numbers so that a stray
  # loanword or name cannot carry the verdict.
  hits() { printf '%s' "$1" | grep -oiE "\\b($2)\\b" | wc -l; }

  case "$lang" in
    es)
      SCRIPT="Spanish"
      N=$(hits "$BODY" "el|la|los|las|que|de|una?|con|para|pero|porque")
      ;;
    id)
      SCRIPT="Indonesian"
      N=$(hits "$BODY" "yang|dan|tidak|dengan|untuk|adalah|itu|ini|dari|akan")
      ;;
    zh-CN)
      SCRIPT="Simplified Chinese"
      # Han is unambiguous where it applies, and character ranges through grep
      # are locale-dependent, so test the UTF-8 bytes directly.
      N=$(printf '%s' "$BODY" | LC_ALL=C grep -oP '[\xe4-\xe9][\x80-\xbf][\x80-\xbf]' | wc -l)
      ;;
    *)
      SCRIPT="unknown"; N=0
      ;;
  esac

  # Three markers is well past chance for prose of this length, and well under
  # what any real piece in the language contains.
  if [ "$N" -ge 3 ]; then SOK="ok  "; else SOK="FAIL"; FAILED=1; fi

  # The prose block must be marked with the learner's language. <html lang="en">
  # is correct and stays - the UI chrome really is English - so look for the
  # content marker specifically, not just any lang attribute.
  if printf '%s' "$BODY" | grep -q "lang=\"$lang\""; then
    LOK="ok  "
  else
    LOK="FAIL"; FAILED=1
  fi

  echo "  piece   : $ID"
  echo "  $SOK reads as: $SCRIPT ($N markers)"
  echo "  $LOK prose   : marked lang=\"$lang\""
  rm -f "$JAR"
done

if [ "${FAILED:-0}" = 1 ]; then
  echo; echo "smoke FAILED"; exit 1
fi
echo; echo "each language generates its own script"
