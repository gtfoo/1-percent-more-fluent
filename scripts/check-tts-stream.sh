#!/usr/bin/env bash
# The streaming audio routes, over real HTTP — WITHOUT synthesising anything.
#
#   bash scripts/dev.sh && bash scripts/check-tts-stream.sh
#
# Costs nothing, deliberately. Every assertion below runs against clips that
# were already synthesised, by the NON-streaming code, before these routes
# existed. That is what makes it a real test rather than a tautology: if
# narrationHash/dialogueHash/spokenTextFor disagreed with what narrate() and
# narrateDialogue() originally hashed, the redirect would miss and the route
# would quietly synthesise a second copy of a clip we have already paid for.
# Matching an old clip is the proof they agree.
#
# The other half of the same trap is the alignment route: it must answer 202
# and spend nothing while a clip is absent, rather than generating timings of
# its own. Two endpoints each producing what they need would bill every
# narration twice.
set -u

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null
fi

PORT=3003
BASE="http://127.0.0.1:$PORT"
COOKIE="fluent_uid=zzcheck-tts-streamzz"

pass=0
fail=0
ok() { if [ "$2" = "1" ]; then echo "ok   $1"; pass=$((pass+1)); else echo "FAIL $1  ${3:-}"; fail=$((fail+1)); fi }

if ! curl -s -o /dev/null "$BASE/"; then
  echo "no dev server on $PORT - run: bash scripts/dev.sh"
  exit 1
fi

# Pick real pieces out of the local database rather than hardcoding ids, so
# this survives on a machine with different data.
#
# Selected by WHETHER THE CLIP IS ON DISK UNDER THE HASH WE COMPUTE TODAY, not
# by whether the `audio` table has a row. Those are different questions and the
# first draft asked the wrong one: `audio` is the spend ledger - what has ever
# been paid for - while the cache is the set of files, and the route looks up
# the file. A piece whose text-shaping has changed since it was spoken still has
# a ledger row but no longer has a clip under its current hash, so feeding one
# to the stream route makes it correctly synthesise a fresh copy. That is a real
# ElevenLabs charge, which is exactly what this check exists to avoid.
read -r STORY CONVO UNCACHED <<EOF
$(npx tsx -e '
import { getDb } from "./src/server/db";
import { getPiece } from "./src/server/generate";
import { spokenTextFor, narrationHash, dialogueHash, clipExists } from "./src/server/tts";
void (async () => {
  const db = getDb();
  const ids = (db.prepare("SELECT id FROM pieces").all() as any[]).map((r) => r.id);
  const cached: Record<string, string> = {};
  let uncached = "";
  for (const id of ids) {
    const p = getPiece(id);
    if (!p) continue;
    const s = spokenTextFor(p);
    const hash = s.mode === "dialogue" ? dialogueHash(s.inputs) : narrationHash(s.text);
    const slot = p.format === "conversation" ? "convo" : "story";
    if (await clipExists(hash)) { if (!cached[slot]) cached[slot] = id; }
    else if (!uncached) uncached = id;
  }
  console.log([cached.story ?? "", cached.convo ?? "", uncached].join(" "));
})();
' 2>/dev/null | tail -1)
EOF

# A backstop, not a timing assertion. Every request below is meant to be a
# redirect or a small JSON body; none should take a second. If a selection bug
# ever points one at real synthesis again, this cuts it off in seconds instead
# of streaming - and billing - a whole clip.
CURL="curl -s --max-time 15"

echo "--- an already-spoken piece is never spoken again ---"
if [ -n "$STORY" ]; then
  code=$($CURL -o /dev/null -w '%{http_code}' -b "$COOKIE" "$BASE/api/tts/stream?piece=$STORY")
  loc=$($CURL -D - -o /dev/null -b "$COOKIE" "$BASE/api/tts/stream?piece=$STORY" | grep -i '^location:' | tr -d '\r')
  [ "$code" = "302" ] && ok "a cached narration redirects rather than streaming" 1 \
    || ok "a cached narration redirects rather than streaming" 0 "HTTP $code"
  echo "$loc" | grep -q "/audio/.*\.mp3" \
    && ok "...straight at the static file" 1 || ok "...straight at the static file" 0 "$loc"
else
  ok "a cached narration redirects" 0 "no cached narration in this database"
fi

# The dialogue path hashes a JSON payload of cast turns, not the prose, so it
# is the one most likely to drift from what originally wrote the file.
if [ -n "$CONVO" ]; then
  code=$($CURL -o /dev/null -w '%{http_code}' -b "$COOKIE" "$BASE/api/tts/stream?piece=$CONVO")
  [ "$code" = "302" ] && ok "a cached CONVERSATION does too" 1 \
    || ok "a cached CONVERSATION does too" 0 "HTTP $code - the dialogue hash disagrees with what wrote the clip"
fi

echo
echo "--- the timings come from the file, not a second synthesis ---"
if [ -n "$STORY" ]; then
  body=$($CURL -b "$COOKIE" "$BASE/api/tts/alignment?piece=$STORY")
  echo "$body" | grep -q '"ready":true' && ok "a finished clip hands back its alignment" 1 \
    || ok "a finished clip hands back its alignment" 0
  echo "$body" | grep -q '"characters"' && ok "...with per-character timings" 1 \
    || ok "...with per-character timings" 0
  echo "$body" | grep -q '"mode":"narration"' && ok "...and says which coordinate space" 1 \
    || ok "...and says which coordinate space" 0
fi
if [ -n "$CONVO" ]; then
  $CURL -b "$COOKIE" "$BASE/api/tts/alignment?piece=$CONVO" | grep -q '"mode":"dialogue"' \
    && ok "a conversation is labelled dialogue, not narration" 1 \
    || ok "a conversation is labelled dialogue, not narration" 0
fi

if [ -n "$UNCACHED" ]; then
  before=$(npx tsx -e 'import{getDb}from"./src/server/db";console.log((getDb().prepare("SELECT COUNT(*) n FROM audio").get() as any).n)' 2>/dev/null | tail -1)
  code=$($CURL -o /dev/null -w '%{http_code}' -b "$COOKIE" "$BASE/api/tts/alignment?piece=$UNCACHED")
  after=$(npx tsx -e 'import{getDb}from"./src/server/db";console.log((getDb().prepare("SELECT COUNT(*) n FROM audio").get() as any).n)' 2>/dev/null | tail -1)
  [ "$code" = "202" ] && ok "an unspoken piece answers 'not yet'" 1 \
    || ok "an unspoken piece answers 'not yet'" 0 "HTTP $code"
  # The assertion that matters: asking for timings must not have spent money.
  [ "$before" = "$after" ] && ok "...and synthesised nothing to answer" 1 \
    || ok "...and synthesised nothing to answer" 0 "audio rows $before -> $after"
fi

echo
echo "--- guards ---"
code=$($CURL -o /dev/null -w '%{http_code}' -b "$COOKIE" "$BASE/api/tts/stream?piece=nope")
[ "$code" = "404" ] && ok "an unknown piece is refused before any spend" 1 \
  || ok "an unknown piece is refused before any spend" 0 "HTTP $code"
code=$($CURL -o /dev/null -w '%{http_code}' -b "$COOKIE" "$BASE/api/tts/alignment?piece=nope")
[ "$code" = "404" ] && ok "...on the alignment route too" 1 || ok "...on the alignment route too" 0 "HTTP $code"

echo
if [ "$fail" -gt 0 ]; then echo "$fail failing"; exit 1; fi
echo "$pass checks passed"
