#!/usr/bin/env bash
# Is the site actually serving a working page, not just answering 200?
#
#   bash scripts/verify-serving.sh                       # http://127.0.0.1:3100
#   bash scripts/verify-serving.sh http://127.0.0.1:3006
#
# The failure this exists for: `output: "standalone"` does not copy
# .next/static or public into the server directory - the deploy places them by
# hand. If that step is missing or half-done, the HTML still returns 200 while
# every stylesheet and script fails, and the reader gets bare unstyled markup.
#
# Status codes alone cannot see it. The page is 200 either way. What matters is
# whether the assets the page REFERENCES load, which is what this checks.
#
# Exits non-zero on failure, so deploy.sh can refuse to call a deploy finished.
set -u

BASE="${1:-http://127.0.0.1:${FLUENT_PORT:-3100}}"

for _ in $(seq 1 30); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/" || true)" = "200" ] && break
  sleep 1
done

home=$(curl -s "$BASE/" || true)
if [ -z "$home" ]; then
  echo "!! $BASE/ returned nothing"
  exit 1
fi

# Only src=/href= attributes. The RSC payload embedded in the same document
# carries these paths with escaped quotes, so matching the whole file yields
# entries with a trailing backslash that 404 - a broken site reported on a
# healthy one.
assets=$(printf '%s' "$home" | grep -oE '(src|href)="/_next/static/[^"]*"' \
  | sed -e 's/^[a-z]*="//' -e 's/"$//' | sort -u)

if [ -z "$assets" ]; then
  echo "!! the page references no static assets at all"
  exit 1
fi

broken=0
count=0
for a in $assets; do
  count=$((count + 1))
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$a" || echo 000)
  if [ "$code" != "200" ]; then
    broken=$((broken + 1))
    echo "!! $code $a"
  fi
done

if [ "$broken" -gt 0 ]; then
  echo "!! $broken of $count assets are not being served."
  echo "!! Most likely the standalone assembly did not happen - check that"
  echo "!! .next/standalone/.next/static and .next/standalone/public exist."
  exit 1
fi

echo "    $count assets served"
