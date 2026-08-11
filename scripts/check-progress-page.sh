#!/usr/bin/env bash
# Render /progress over real HTTP against the dev server.
#
#   bash scripts/dev.sh && bash scripts/check-progress-page.sh
#
# scripts/check-progress.ts already covers the arithmetic offline. This covers
# the thing that file cannot: that the page assembles, that the strings reach
# the markup in the right language, and that the SVG and the table are actually
# emitted rather than thrown away by a guard.
#
# Costs nothing: no LLM, no TTS. Every row it reads it created itself.
set -u

# better-sqlite3 is a native module built for Node 20. Without this the fixture
# cannot open the database and every check below fails for a reason that has
# nothing to do with the page.
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

# Everything a server component renders also appears inside the RSC payload, in
# a <script> tag. Grepping the raw response therefore passes even when the page
# renders nothing at all - it has done exactly that here before. Strip the
# scripts and assert only on markup the reader can actually see.
visible() { perl -0777 -pe 's{<script.*?</script>}{}gs'; }
get() { curl -s -b "fluent_uid=$USER_ID${2:-}" "$BASE$1" | visible; }

echo "--- the page renders, in the reader's language ---"
html=$(get /progress)
code=$(curl -s -o /dev/null -w '%{http_code}' -b "fluent_uid=$USER_ID" "$BASE/progress")
[ "$code" = "200" ] && ok "HTTP 200" 1 || ok "HTTP 200" 0 "HTTP $code"
# Level 41 is over Spanish's uiFromLevel of 40, so the chrome is Spanish.
has "heading, in Spanish" "Cuánto has avanzado" "$html"
has "the headline is the band" "Tu nivel" "$html"
has "the level section" "Tu nivel, texto a texto" "$html"
has "the breadth grid" "Sobre qué has leído" "$html"
has "the reading days" "Días que leíste" "$html"
hasnt "no empty state, this reader has read" "Todavía no hay nada que mostrar" "$html"

echo
echo "--- bands, and no vocabulary count anywhere ---"
# The fixture placed at 1400 words (level ~28, A2) and now sits at level 41
# (B1). Both ends of the journey must be present, as BANDS.
has "where they are now" ">B1<" "$html"
has "and where the check put them" "A2" "$html"
has "nine finished readings counted" "en 9 textos que terminaste" "$html"
# The growth sentence, not the shrink one. They are different sentences rather
# than one with a sign, and picking the wrong one is what this catches.
has "going up is worded as going up" "Has subido desde A2" "$html"

# The whole point of the change. That figure was the size of a slice of an
# OpenSubtitles frequency list - word forms, proper nouns and English included -
# presented as a count of what the reader knows. It must not survive anywhere on
# the page, in any locale's spelling of it.
for n in "1400" "1.400" "1,400" "2269" "2.269" "2,269"; do
  hasnt "no vocabulary count on the page ($n)" "$n" "$html"
done
# ...nor on the home page, which used to carry "· unas 2269 palabras" beside
# the band and a raw count in the row that opens this page.
home=$(get /)
# Matched on the middot that aboutWords carried, not on the word "palabras" -
# the home page legitimately says "frases de unas 14 palabras" in the aiming
# line, and matching that would fail whatever the level card did.
hasnt "nor beside the level on the home page" "· unas" "$home"
hasnt "nor in the row that links here" ">2269<" "$home"
# Six distinct cells, from nine readings: philosophy/story was read twice, and
# the 'other' and unlabelled ones are footnotes rather than cells.
has "six of twenty-four squares covered" "6 de 24 cuadros" "$html"
has "days read out of the window" "Leíste " "$html"
has "and the longest run" "Racha más larga" "$html"

echo
echo "--- readable without a hover, which a phone does not have ---"
# Same reason as the grid counts: the shades and the position in the year were
# decodable only by pointing a mouse at them.
has "the shades are keyed" "buscaste una palabra" "$html"
has "...all three of them" "terminaste un texto" "$html"
echo "$html" | grep -qE '>(ene|feb|mar|abr|may|jun|jul|ago|sept|oct|nov|dic)<' \
  && ok "the calendar says where in the year you are, in Spanish" 1 \
  || ok "the calendar says where in the year you are, in Spanish" 0

echo
echo "--- the drawings exist ---"
charts=$(echo "$html" | grep -o '<svg' | wc -l)
[ "$charts" -ge 2 ] && ok "a level chart and a calendar" 1 || ok "a level chart and a calendar" 0 "$charts svg"
echo "$html" | grep -q 'vectorEffect\|vector-effect' && ok "strokes do not scale with the phone" 1 \
  || ok "strokes do not scale with the phone" 0
# The dotted segment is the whole point of the chart: the reader moved their own
# level between day 6 and day 9 and no session recorded it. A solid line there
# would be the page inventing a reading that never happened.
echo "$html" | grep -q 'stroke-dasharray="3 3"' && ok "the self-adjusted gap is drawn dotted" 1 \
  || ok "the self-adjusted gap is drawn dotted" 0
has "the legend says what dotted means" "ajustaste el nivel tú mismo" "$html"
has "and the legend names the placement dot" "Donde te situó la prueba de nivel" "$html"
# The y axis is ticked in bands. A tick reading "2054" was quoting the same
# discredited count as the old headline, in smaller type.
echo "$html" | grep -qE '>(A1|A2|B1|B2|C1|C2)</text>' \
  && ok "the axis is ticked in bands, not word counts" 1 \
  || ok "the axis is ticked in bands, not word counts" 0
# --warn is this app's error colour. A level coming down is the app working.
hasnt "a drop is not coloured as an error" "var(--warn)" "$html"

echo
echo "--- the grid ---"
cells=$(echo "$html" | grep -o 'class="[^"]*h-9 w-full items-center' | wc -l)
[ "$cells" = "24" ] && ok "eight subjects by three formats" 1 || ok "eight subjects by three formats" 0 "$cells cells"
has "a subject the fixture read about" "Comida" "$html"
has "started but not finished, named as such" "Empezado, sin terminar" "$html"
# A touchscreen has no hover, so anything only a `title` says is invisible on
# the device most of this app's reading happens on. The count goes in the cell.
has "the count is in the cell, not only in a tooltip" ">2</div>" "$html"
echo "$html" | grep -q 'border-dashed' && ok "and drawn dashed, not shaded" 1 \
  || ok "and drawn dashed, not shaded" 0
# 'other' and NULL are two different facts and must stay two footnotes, never
# cells - a 25th cell would invite chasing a subject nobody can ask for.
hasnt "'other' is not a row" ">other<" "$html"
# It is a footnote instead, and a separately worded one from the unlabelled
# pieces - db.ts calls that distinction deliberate, so the page must keep it.
has "'other' is a footnote" "Y 1 textos que no encajaban" "$html"
echo "$html" | grep -q "antes de que la app" && ok "unlabelled pieces get their own words" 1 \
  || ok "unlabelled pieces get their own words" 0

echo
echo "--- every dot states its reason ---"
# A falling line with a stated cause is a measurement; a bare falling line is a
# scoreboard. Day 5 dropped 36 -> 33 because the reader said so; day 10 moved
# after looking up 12% of the words. Two different reasons, both from the row
# that caused the move.
has "the drop carries the reader's own verdict" "<title>Muy difícil</title>" "$html"
has "and a heavy-lookup dot says how heavy" "buscaste el 12% de las palabras" "$html"

echo
echo "--- English, when asked for it ---"
en=$(get /progress ";fluent_ui=english")
has "the same page in English" "How far you’ve come" "$en"
has "English field labels too" "Money" "$en"
hasnt "and no Spanish left behind" "Sobre qué has leído" "$en"
# The locale still has to follow the chrome, but there are no thousands left on
# this page to prove it with. The calendar's month names carry it instead:
# Spanish gives "ago"/"sept" lowercase, English gives "Aug"/"Sep" capitalised.
echo "$en" | grep -qE '>(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)</text>' \
  && ok "and the months are English too" 1 || ok "and the months are English too" 0

echo
echo "--- the day boundary is the reader's, not Greenwich's ---"
# One fixture lookup sits at 17:00 UTC on the 19th, which is the 20th in
# Singapore, and nothing else happens on either day. Which square it lands on is
# a direct readout of whose midnight the calendar counts - and the UTC answer
# was breaking real streaks for anyone who reads late at night east of London.
# Matched with the event count attached: every square in the window carries its
# date, so the date alone would match empty days too and assert nothing.
has "with no cookie, the day is UTC's" "2026-07-19 — 1" "$html"
sg=$(get /progress ";fluent_tz=480")
has "at UTC+8 the same moment is the next day" "2026-07-20 — 1" "$sg"
hasnt "...and it has moved off the UTC day" "2026-07-19 — 1" "$sg"
# The cookie is browser-written, so a hostile value must not empty the calendar:
# an unparseable SQLite modifier returns NULL rather than raising, and every
# event would bucket under a null day with nothing in the logs.
junk=$(get /progress ";fluent_tz=nonsense")
has "junk in the cookie falls back rather than blanking" "2026-07-19 — 1" "$junk"
home=$(get /)
has "a row linking to it" 'href="/progress"' "$home"
has "saying what it shows, not naming a section" "Tu nivel" "$home"

echo
echo "--- a reader who has not read anything yet ---"
npx tsx scripts/fixture-progress.ts empty >/dev/null
none=$(get /progress)
has "the empty state is named, not blank" "Todavía no hay nada que mostrar" "$none"
has "and says what will fill it" "Termina un texto y esto se llena" "$none"
has "with a way back to reading" "href=\"/\"" "$none"
# A chart of nothing is a stray axis floating in a box. The section goes.
echo "$none" | grep -q 'viewBox="0 0 360 180"' && ok "no chart with nothing to chart" 0 "drawn anyway" \
  || ok "no chart with nothing to chart" 1
# The grid stays, empty. It is the shape the reading fills, and hiding it would
# hide the only thing on the page that says what is possible.
has "the grid is still there, empty" "Sobre qué has leído" "$none"
# The /words rule: no link until there is something behind it. A progress page
# offered before anything has been read is a promise the app has not kept.
hasnt "and the home page does not offer the link yet" 'href="/progress"' "$(get /)"
cells=$(echo "$none" | grep -o 'class="[^"]*h-9 w-full items-center' | wc -l)
[ "$cells" = "24" ] && ok "all twenty-four squares, none filled" 1 || ok "all twenty-four squares" 0 "$cells"
# The cell class specifically - the "start reading" button is bg-accent too,
# and matching that would pass whatever the grid did.
hasnt "and none of them filled" "font-medium bg-accent" "$none"

echo
echo "--- guards ---"
code=$(curl -s -o /dev/null -w '%{http_code}' -L "$BASE/progress")
[ "$code" = "200" ] && ok "an unplaced visitor is redirected, not 500ed" 1 \
  || ok "an unplaced visitor is redirected, not 500ed" 0 "HTTP $code"

echo
if [ "$fail" -gt 0 ]; then echo "$fail failing"; exit 1; fi
echo "$pass checks passed"
