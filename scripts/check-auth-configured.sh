#!/usr/bin/env bash
# The other half: with AUTH_* present, sign-in is actually offered.
#
#   bash scripts/check-auth-configured.sh
#
# Starts its own dev server on a spare port with a DUMMY Resend key, so nothing
# is ever sent. It never submits the form - that would hit Resend for real. What
# it proves is that the endpoints mount, the form renders, and the header offers
# the link, which is everything up to the moment mail leaves.
set -u

PORT=3004
BASE="http://127.0.0.1:$PORT"
UID_ES=445e3269-f599-4027-98fa-3c4498838c9a

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null
fi

cd "$(dirname "$0")/.." || exit 1

# Next 16 refuses to run a second dev server from the same directory, so this
# takes exclusive use of it: any existing one is stopped, and scripts/dev.sh
# restarts the normal one at the end.
for p in 3003 "$PORT"; do
  for pid in $(ss -ltnp 2>/dev/null | grep ":$p " | grep -oP 'pid=\K[0-9]+' | sort -u); do
    kill -9 "$pid" 2>/dev/null || true
  done
done
sleep 1

# Generated per run rather than written down. A hardcoded one in a committed
# script reads like a real secret to anyone skimming, and to any scanner.
AUTH_SECRET="$(openssl rand -base64 32)"
export AUTH_SECRET
export AUTH_RESEND_KEY="re_dummy_never_used_by_this_test"
export AUTH_EMAIL_FROM="login@gtfoo.com"
export AUTH_URL="$BASE"

LOG=/tmp/fluent-auth-dev.log
setsid nohup npm run dev -- -H 127.0.0.1 -p "$PORT" >"$LOG" 2>&1 < /dev/null &
disown

ready=0
for _ in $(seq 1 60); do
  sleep 1
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/" || true)" = "200" ]; then ready=1; break; fi
done
if [ "$ready" != "1" ]; then echo "dev server did not start"; tail -20 "$LOG"; exit 1; fi

cleanup() {
  for pid in $(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K[0-9]+' | sort -u); do
    kill -9 "$pid" 2>/dev/null || true
  done
  echo
  echo "(dev server on $PORT stopped - run 'bash scripts/dev.sh' for the normal one)"
}
trap cleanup EXIT

pass=0
fail=0
ok() { if [ "$2" = "1" ]; then echo "ok   $1"; pass=$((pass+1)); else echo "FAIL $1  ${3:-}"; fail=$((fail+1)); fi }

echo "--- the endpoints mount now ---"
body=$(curl -s "$BASE/api/auth/providers")
echo "$body" | grep -q resend && ok "resend is offered" 1 || ok "resend is offered" 0 "$body"
c=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/auth/session")
[ "$c" = "200" ] && ok "session endpoint answers" 1 || ok "session endpoint answers" 0 "got $c"
sess=$(curl -s "$BASE/api/auth/session")
[ "$sess" = "{}" ] || [ "$sess" = "null" ] && ok "...with no session yet" 1 || ok "...no session" 0 "$sess"

echo
echo "--- the page offers a real form ---"
curl -s -b "fluent_uid=$UID_ES" "$BASE/signin" > /tmp/auth-c-signin.html
grep -q 'type="email"' /tmp/auth-c-signin.html && ok "email field" 1 || ok "email field" 0
grep -q "Enviarme un enlace" /tmp/auth-c-signin.html && ok "submit button, in Spanish" 1 || ok "submit button" 0
grep -q "caduca en 15 minutos" /tmp/auth-c-signin.html && ok "expiry stated" 1 || ok "expiry stated" 0
grep -q "configurado en este servidor" /tmp/auth-c-signin.html \
  && ok "no longer says it is unconfigured" 0 "still says unconfigured" \
  || ok "no longer says it is unconfigured" 1

echo
echo "--- and the header links to it ---"
curl -s -b "fluent_uid=$UID_ES" "$BASE/" > /tmp/auth-c-home.html
# Scoped to the rendered <header>, NOT the whole document. Every UiStrings value
# is serialised into the RSC payload for the client components that receive it,
# so "Cerrar sesión" is present in the HTML as data whether or not a button
# exists - grepping the file would assert nothing.
grep -o '<header.*</header>' /tmp/auth-c-home.html > /tmp/auth-c-header.html || true
echo "  header: $(wc -c < /tmp/auth-c-header.html) bytes"
grep -q 'href="/signin"' /tmp/auth-c-header.html && ok "sign-in link in the header" 1 \
  || ok "sign-in link in the header" 0
grep -q "Iniciar sesión" /tmp/auth-c-header.html && ok "...in Spanish" 1 || ok "...in Spanish" 0
grep -q "Cerrar sesión" /tmp/auth-c-header.html \
  && ok "not offering sign-out while signed out" 0 "sign-out rendered" \
  || ok "not offering sign-out while signed out" 1

echo
echo "--- the app still works for someone who never signs in ---"
for p in / /words /setup; do
  c=$(curl -s -o /dev/null -w '%{http_code}' -b "fluent_uid=$UID_ES" "$BASE$p")
  [ "$c" = "200" ] && ok "200 $p" 1 || ok "200 $p" 0 "got $c"
done
grep -q "taquilla" <(curl -s -b "fluent_uid=$UID_ES" "$BASE/words") \
  && ok "their words are still theirs" 1 || ok "their words are still theirs" 0

echo
if [ "$fail" -gt 0 ]; then echo "$fail failing"; exit 1; fi
echo "$pass checks passed"
