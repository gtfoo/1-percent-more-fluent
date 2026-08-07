#!/usr/bin/env bash
# With auth UNCONFIGURED, the app must behave exactly as it did before it had
# any auth code in it. That is the state every existing reader is in.
#
#   bash scripts/dev.sh && bash scripts/check-auth-page.sh
set -u

# better-sqlite3 is a native module built for Node 20. Without this the schema
# checks below read an empty column list and fail for a reason that has nothing
# to do with the schema.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null
fi

cd "$(dirname "$0")/.." || exit 1

BASE=http://127.0.0.1:3003
UID_ES=445e3269-f599-4027-98fa-3c4498838c9a

pass=0
fail=0
ok() { if [ "$2" = "1" ]; then echo "ok   $1"; pass=$((pass+1)); else echo "FAIL $1  ${3:-}"; fail=$((fail+1)); fi }

get() { curl -s -b "fluent_uid=$UID_ES" "$BASE$1"; }
code() { curl -s -o /dev/null -w '%{http_code}' -b "fluent_uid=$UID_ES" "$BASE$1"; }

echo "--- every route still answers ---"
for p in / /words /setup /signin /signin/check-email; do
  c=$(code "$p")
  [ "$c" = "200" ] && ok "200 $p" 1 || ok "200 $p" 0 "got $c"
done

echo
echo "--- the reader's existing data is untouched ---"
get /words > /tmp/auth-words.html
grep -q "Palabras que buscaste" /tmp/auth-words.html && ok "word list still renders, in Spanish" 1 || ok "word list still renders" 0
grep -q "taquilla" /tmp/auth-words.html && ok "their words are still there" 1 || ok "their words are still there" 0
get / > /tmp/auth-home.html
grep -q "Todo lo que has leído" /tmp/auth-home.html && ok "reading history still renders" 1 || ok "reading history still renders" 0

echo
echo "--- nothing is offered that does not work ---"
n=$(grep -c 'href="/signin"' /tmp/auth-home.html || true)
[ "$n" = "0" ] && ok "no sign-in link while unconfigured" 1 || ok "no sign-in link while unconfigured" 0 "found $n"
# In Spanish, because this reader is above the threshold where the interface
# switches - so this doubles as proof the sign-in pages are localised like
# everything else rather than being an English island.
get /signin > /tmp/auth-signin.html
grep -q "configurado en este servidor" /tmp/auth-signin.html \
  && ok "/signin says so rather than erroring, in Spanish" 1 \
  || ok "/signin says so" 0 "$(grep -o 'servidor[^<]*\|server[^<]*' /tmp/auth-signin.html | head -1)"
grep -q "Iniciar sesión" /tmp/auth-signin.html && ok "...with a Spanish heading" 1 \
  || ok "...with a Spanish heading" 0
# No form to submit when there is no provider behind it.
grep -q 'type="email"' /tmp/auth-signin.html && ok "no dead email form" 0 "form rendered" \
  || ok "no dead email form" 1

echo
echo "--- the auth endpoints are not mounted at all ---"
# Unmounted rather than mounted-and-broken. Auth.js answers every request with
# a 500 config error when AUTH_SECRET is absent, which misrepresents a
# supported state as a server fault.
for p in /api/auth/providers /api/auth/session /api/auth/signin; do
  c=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")
  [ "$c" = "404" ] && ok "404 $p" 1 || ok "404 $p" 0 "got $c"
done

echo
echo "--- the new columns landed on the existing database ---"
cols=$(npx tsx -e 'const {getDb}=require("./src/server/db");console.log(getDb().prepare("PRAGMA table_info(users)").all().map(c=>c.name).join(","))' 2>/dev/null | tail -1)
echo "  users: $cols"
for c in email email_verified token_version; do
  echo "$cols" | grep -q "$c" && ok "users.$c" 1 || ok "users.$c" 0
done
tables=$(npx tsx -e 'const {getDb}=require("./src/server/db");console.log(getDb().prepare("SELECT name FROM sqlite_master WHERE type=?").all("table").map(t=>t.name).join(","))' 2>/dev/null | tail -1)
for t in accounts verification_tokens; do
  echo "$tables" | grep -q "$t" && ok "table $t" 1 || ok "table $t" 0
done

echo
if [ "$fail" -gt 0 ]; then echo "$fail failing"; exit 1; fi
echo "$pass checks passed"
