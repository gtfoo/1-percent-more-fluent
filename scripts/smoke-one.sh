#!/usr/bin/env bash
# One generation against a running instance, and which model served it.
#
#   BASE=https://... LANG_CODE=zh-CN bash scripts/smoke-one.sh
#
# Deliberately ONE piece rather than the full sweep in smoke-language.sh: this
# exists to answer "does generation work right now, and via which provider",
# which is a question worth a cent rather than several.
set -u
cd "$(dirname "$0")/.." || exit 1
source ~/.nvm/nvm.sh >/dev/null 2>&1
nvm use 20 >/dev/null 2>&1

BASE="${BASE:-http://127.0.0.1:3003}"
LANG_CODE="${LANG_CODE:-zh-CN}"
JAR=$(mktemp)

ITEMS=$(curl -s -c "$JAR" -b "$JAR" "$BASE/api/placement?language=$LANG_CODE" \
  | npx --yes tsx -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(JSON.stringify(d.items))' 2>/dev/null)

curl -s -c "$JAR" -b "$JAR" -X POST "$BASE/api/placement" \
  -H 'Content-Type: application/json' \
  -d "{\"shown\":$ITEMS,\"known\":[],\"readbackLevel\":45,\"language\":\"$LANG_CODE\"}" > /dev/null

echo "generating..."
RESP=$(curl -s -c "$JAR" -b "$JAR" -X POST "$BASE/api/generate" \
  -H 'Content-Type: application/json' \
  -d '{"format":"conversation","topic":"explaining payment terms to a client","length":"short"}')

ID=$(printf '%s' "$RESP" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
if [ -z "$ID" ]; then
  echo "FAILED: $(printf '%s' "$RESP" | head -c 400)"
  rm -f "$JAR"
  exit 1
fi

echo "piece $ID"
rm -f "$JAR"

# Delegated rather than re-implemented: this check lived here as a here-string
# pipeline and reported "not Han" for a page that was fine, because the body
# had not arrived in the variable it was testing.
BASE="$BASE" bash scripts/check-read-page.sh "$ID"
