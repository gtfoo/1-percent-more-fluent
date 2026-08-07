#!/usr/bin/env bash
# Run ON the droplet. Is the passkey option actually reaching a reader?
set -eu
SITE=https://1-percent-more-fluent.gtfoo.com
cd /home/deploy/1-percent-more-fluent || exit 1
export DATA_DIR=/home/deploy/1-percent-more-fluent/data

pass=0; fail=0
ok() { if [ "$2" = 1 ]; then echo "ok   $1"; pass=$((pass+1)); else echo "FAIL $1  ${3:-}"; fail=$((fail+1)); fi }

# Everything passed to a client component is serialised into the page inside
# <script> tags, and this app passes whole UiStrings objects around - so the raw
# HTML contains every string whether or not it was rendered.
rendered() { perl -0777 -pe 's/<script\b.*?<\/script>//gs'; }

echo "--- providers ---"
p=$(curl -s "$SITE/api/auth/providers")
echo "$p" | grep -q '"resend"' && ok "magic link offered" 1 || ok "magic link offered" 0
echo "$p" | grep -q '"passkey"' && ok "passkey offered" 1 || ok "passkey offered" 0 "$p"

echo "--- the sign-in page ---"
curl -s "$SITE/signin" | rendered > /tmp/s.html
grep -q 'type="email"' /tmp/s.html && ok "email form rendered" 1 || ok "email form rendered" 0
grep -qE 'Use a passkey|Usar una clave|通行密钥' /tmp/s.html && ok "passkey button rendered" 1 \
  || ok "passkey button rendered" 0 "$(grep -o 'passkey[^<]*' /tmp/s.html | head -1)"

echo "--- the guard, in production ---"
c=$(curl -s -o /dev/null -w '%{http_code}' "$SITE/api/auth/webauthn-options/passkey?action=register&email=stranger@example.com")
[ "$c" = 400 ] && ok "a passkey cannot mint an account" 1 || ok "a passkey cannot mint an account" 0 "HTTP $c"
c=$(curl -s -o /dev/null -w '%{http_code}' "$SITE/api/auth/webauthn-options/passkey?action=authenticate")
[ "$c" = 200 ] && ok "authenticating stays open" 1 || ok "authenticating stays open" 0 "HTTP $c"

echo "--- nothing else moved ---"
for p in / /words /setup; do
  c=$(curl -s -o /dev/null -w '%{http_code}' "$SITE$p")
  [ "$c" = 200 ] || [ "$c" = 307 ] && ok "$p ($c)" 1 || ok "$p" 0 "HTTP $c"
done

echo
[ "$fail" -gt 0 ] && { echo "$fail failing"; exit 1; }
echo "$pass checks passed"
