#!/usr/bin/env bash
# Point this project's .env.local at the Resend key that already works for
# career-side-quests, for LOCAL testing only.
#
#   bash scripts/wire-auth-local.sh
#
# Never prints a secret. The Resend key is account-wide, so one key sends for
# every verified domain - but AUTH_SECRET is generated fresh, because it signs
# THIS app's JWTs and sharing it across two apps means a token minted by one is
# a token the other will accept.
set -eu
cd "$(dirname "$0")/.." || exit 1

SRC=~/Git/career-side-quests/.env.local
DST=.env.local

[ -f "$SRC" ] || { echo "no $SRC to copy the key from"; exit 1; }
[ -f "$DST" ] || { echo "no $DST"; exit 1; }

if grep -qE '^[[:space:]]*AUTH_RESEND_KEY=' "$DST"; then
  echo "AUTH_RESEND_KEY is already set here - leaving everything alone"
  exit 0
fi

cp "$DST" "$DST.before-auth"
echo "backed up to $DST.before-auth"

KEY_LINE=$(grep -E '^[[:space:]]*AUTH_RESEND_KEY=' "$SRC" | tail -1)
[ -n "$KEY_LINE" ] || { echo "no AUTH_RESEND_KEY in $SRC"; exit 1; }

{
  echo ""
  echo "# Sign-in. Added for local testing; see .env.example."
  # Quoted: base64 can contain a #, which dotenv reads as a comment and
  # truncates, leaving the variable silently empty.
  echo "AUTH_SECRET=\"$(openssl rand -base64 32)\""
  echo "$KEY_LINE"
  echo "AUTH_EMAIL_FROM=login@gtfoo.com"
  echo "AUTH_URL=http://localhost:3003"
} >> "$DST"

echo "wrote AUTH_SECRET (fresh), AUTH_RESEND_KEY (copied), AUTH_EMAIL_FROM, AUTH_URL"
echo "no secret was printed"
