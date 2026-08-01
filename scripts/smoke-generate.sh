#!/usr/bin/env bash
# End-to-end: generate a piece through the running server as a real user, then
# report what the difficulty checker measured. Requires the dev server on :3003.
#
#   bash scripts/smoke-generate.sh "a folk tale about a stubborn goat"
set -eu
cd "$(dirname "$0")/.." || exit 1
source ~/.nvm/nvm.sh >/dev/null 2>&1
nvm use 20 >/dev/null 2>&1

TOPIC="${1:-an article about why cities are getting hotter}"
USER_ID=$(npx tsx scripts/print-user.ts)

echo "user  : $USER_ID"
echo "topic : $TOPIC"
echo "generating (20-60s) ..."

curl -s -X POST http://127.0.0.1:3003/api/generate \
  -H "Content-Type: application/json" \
  -H "Cookie: fluent_uid=$USER_ID" \
  -d "{\"format\":\"article\",\"topic\":\"$TOPIC\",\"length\":\"short\"}"

echo
echo
npx tsx scripts/print-last-piece.ts
