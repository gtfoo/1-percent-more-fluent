#!/usr/bin/env bash
# Generate a Chinese piece and synthesise it, so check-alignment.ts has a
# Chinese alignment to measure. Spends ElevenLabs credit - a short piece is
# about 200 characters, roughly two cents.
set -u
cd "$(dirname "$0")/.." || exit 1
source ~/.nvm/nvm.sh >/dev/null 2>&1
nvm use 20 >/dev/null 2>&1

BASE="${BASE:-http://127.0.0.1:3003}"
FORMAT="${FORMAT:-story}"
JAR=$(mktemp)

# The placement POST rejects an empty `shown`, so echo back the items it just
# handed out - marking none of them known, which keeps the level (and so the
# piece, and so the TTS bill) small.
ITEMS=$(curl -s -c "$JAR" -b "$JAR" "$BASE/api/placement?language=zh-CN" \
  | npx --yes tsx -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(JSON.stringify(d.items))' 2>/dev/null)

curl -s -c "$JAR" -b "$JAR" -X POST "$BASE/api/placement" \
  -H 'Content-Type: application/json' \
  -d "{\"shown\":$ITEMS,\"known\":[],\"readbackLevel\":28,\"language\":\"zh-CN\"}" > /dev/null

ID=$(curl -s -c "$JAR" -b "$JAR" -X POST "$BASE/api/generate" \
  -H 'Content-Type: application/json' \
  -d "{\"format\":\"$FORMAT\",\"topic\":\"buying fruit at the market\",\"length\":\"short\"}" \
  | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

if [ -z "$ID" ]; then echo "generation failed"; rm -f "$JAR"; exit 1; fi
echo "piece $ID ($FORMAT)"

curl -s -c "$JAR" -b "$JAR" -X POST "$BASE/api/tts" \
  -H 'Content-Type: application/json' \
  -d "{\"pieceId\":\"$ID\"}" | head -c 300
echo
rm -f "$JAR"
