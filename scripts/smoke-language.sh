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

for lang in es zh-CN; do
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

  # What script did the model actually write in? Character ranges through grep
  # are locale-dependent, so test the UTF-8 bytes directly.
  if printf '%s' "$BODY" | LC_ALL=C grep -qP '[\xe4-\xe9][\x80-\xbf][\x80-\xbf]'; then
    SCRIPT="Han (Chinese)"
  elif printf '%s' "$BODY" | grep -qE '[áéíóúñ¿¡]'; then
    SCRIPT="Latin with Spanish diacritics"
  else
    SCRIPT="plain Latin / unclear"
  fi

  case "$lang:$SCRIPT" in
    "es:Latin with Spanish diacritics"|"zh-CN:Han (Chinese)") SOK="ok  " ;;
    *) SOK="FAIL"; FAILED=1 ;;
  esac

  # The prose block must be marked with the learner's language. <html lang="en">
  # is correct and stays - the UI chrome really is English - so look for the
  # content marker specifically, not just any lang attribute.
  if printf '%s' "$BODY" | grep -q "lang=\"$lang\""; then
    LOK="ok  "
  else
    LOK="FAIL"; FAILED=1
  fi

  echo "  piece   : $ID"
  echo "  $SOK script  : $SCRIPT"
  echo "  $LOK prose   : marked lang=\"$lang\""
  rm -f "$JAR"
done

if [ "${FAILED:-0}" = 1 ]; then
  echo; echo "smoke FAILED"; exit 1
fi
echo; echo "each language generates its own script"
