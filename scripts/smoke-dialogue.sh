#!/usr/bin/env bash
# End-to-end: generate a conversation, narrate it as multi-voice dialogue, and
# report the cast plus what the speaker split produced. Requires :3003.
#
#   bash scripts/smoke-dialogue.sh "two friends arguing about a film"
set -eu
cd "$(dirname "$0")/.." || exit 1
source ~/.nvm/nvm.sh >/dev/null 2>&1
nvm use 20 >/dev/null 2>&1

TOPIC="${1:-two friends deciding where to eat}"
USER_ID=$(npx tsx scripts/print-user.ts)

echo "topic : $TOPIC"
echo "generating conversation ..."
GEN=$(curl -s -X POST http://127.0.0.1:3003/api/generate \
  -H "Content-Type: application/json" \
  -H "Cookie: fluent_uid=$USER_ID" \
  -d "{\"format\":\"conversation\",\"topic\":\"$TOPIC\",\"length\":\"short\"}")
echo "$GEN"

PIECE_ID=$(printf '%s' "$GEN" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
if [ -z "$PIECE_ID" ]; then echo "no piece id; aborting"; exit 1; fi

echo
echo "narrating as dialogue ..."
curl -s -X POST http://127.0.0.1:3003/api/tts \
  -H "Content-Type: application/json" \
  -H "Cookie: fluent_uid=$USER_ID" \
  -d "{\"pieceId\":\"$PIECE_ID\"}" \
  | sed 's/"alignment":{[^}]*}/"alignment":<omitted>/'

echo
echo
PIECE_ID="$PIECE_ID" npx tsx scripts/print-dialogue.ts
