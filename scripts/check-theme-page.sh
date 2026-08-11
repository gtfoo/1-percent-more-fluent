#!/usr/bin/env bash
# The settings page and the theme scaffolding, over real HTTP.
#
#   bash scripts/dev.sh && bash scripts/check-theme-page.sh
#
# The toggle itself is client-side and was verified in a browser: choosing light
# on a dark-mode device really does light the page, the choice survives a
# reload, and "Auto" hands control back to the system. What a browser check
# cannot do is stop somebody quietly deleting the pieces that make it work, so
# this pins those.
#
# The inline script is the one with a silent failure mode. Drop it and nothing
# breaks, no test fails, and every reader who chose light on a dark phone gets a
# flash of dark on every page load - the one person who cared enough to choose.
#
# Costs nothing: no LLM, no TTS.
set -u

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null
fi

PORT=3003
BASE="http://127.0.0.1:$PORT"

pass=0
fail=0
ok() { if [ "$2" = "1" ]; then echo "ok   $1"; pass=$((pass+1)); else echo "FAIL $1  ${3:-}"; fail=$((fail+1)); fi }
has() { if echo "$3" | grep -qF -- "$2"; then ok "$1" 1; else ok "$1" 0 "not in the markup"; fi }
hasnt() { if echo "$3" | grep -qF -- "$2"; then ok "$1" 0 "it is in the markup"; else ok "$1" 1; fi }

if ! curl -s -o /dev/null "$BASE/"; then
  echo "no dev server on $PORT - run: bash scripts/dev.sh"
  exit 1
fi

USER_ID=$(npx tsx scripts/fixture-progress.ts add | tail -1)
cleanup() { npx tsx scripts/fixture-progress.ts remove >/dev/null 2>&1 || true; }
trap cleanup EXIT
if [ -z "$USER_ID" ]; then echo "fixture failed"; exit 1; fi

raw() { curl -s -b "fluent_uid=$USER_ID${2:-}" "$BASE$1"; }
visible() { perl -0777 -pe 's{<script.*?</script>}{}gs'; }

echo "--- the no-flash script ---"
html=$(raw /)
has "the stored theme is read before paint" "localStorage.getItem('fluent:theme')" "$html"
has "...and applied to the document element" "documentElement.dataset.theme" "$html"
# In <head>, not at the end of <body>: after the body has painted is exactly
# too late, which is the whole reason this is not a React effect.
head_part=$(echo "$html" | perl -0777 -pe 's{<body.*}{}s')
has "and it sits in the head" "fluent:theme" "$head_part"
# Safari private browsing throws on localStorage rather than returning null, so
# an unguarded read takes the whole page down for those readers.
has "guarded, because localStorage can throw" "try{" "$html"

echo
echo "--- the header carries one link now, not four ---"
seen=$(echo "$html" | visible)
has "settings, in the reader's language" "Ajustes" "$seen"
hasnt "re-test has moved off the bar" "Volver a medir mi nivel" "$seen"
hasnt "and so has signing in" "Iniciar sesión" "$seen"
nav=$(echo "$html" | grep -o '<header.*</header>' | grep -o 'href="/[a-z]*"' | sort -u | wc -l)
[ "$nav" -le 2 ] && ok "at most the logo and one link" 1 || ok "at most the logo and one link" 0 "$nav hrefs"

echo
echo "--- what moved behind it ---"
settings=$(raw /settings | visible)
has "the page renders" "Ajustes" "$settings"
has "the theme control is here" "Tema de color" "$settings"
has "with all three choices" "Automático" "$settings"
has "...light" "Claro" "$settings"
has "...and dark" "Oscuro" "$settings"
has "re-test lives here now" "Volver a medir mi nivel" "$settings"
has "and signing in" "Iniciar sesión" "$settings"
# The group needs a name of its own: three buttons labelled Auto/Light/Dark say
# nothing about what they change to anyone not looking at the page.
has "the buttons are a named group" 'role="group"' "$settings"

echo
echo "--- reachable before anyone has done anything ---"
# Settings is rendered whatever the reader's state, because the colour theme is
# behind it. Gating it on having a profile would hide the one control a
# first-time visitor might actually want.
fresh=$(curl -s "$BASE/settings")
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/settings")
[ "$code" = "200" ] && ok "a first-time visitor gets the page" 1 || ok "a first-time visitor gets the page" 0 "HTTP $code"
has "...with the theme control on it" "Colour theme" "$(echo "$fresh" | visible)"
hasnt "but nothing to re-test yet" "Re-test my level" "$(echo "$fresh" | visible)"

echo
if [ "$fail" -gt 0 ]; then echo "$fail failing"; exit 1; fi
echo "$pass checks passed"
