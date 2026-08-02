#!/usr/bin/env bash
# Is the deployed BUILD carrying the current data, or a stale copy?
set -u
cd "$(dirname "$0")" || exit 1

bash ./droplet.sh '
cd /home/deploy/1-percent-more-fluent

echo "=== source ==="
printf "  src/data/zh-CN/samples.json: %s bytes\n" "$(stat -c %s src/data/zh-CN/samples.json 2>/dev/null || echo missing)"

echo
echo "=== traced copy inside the standalone build ==="
T=.next/standalone/src/data/zh-CN/samples.json
if [ -f "$T" ]; then
  printf "  %s: %s bytes\n" "$T" "$(stat -c %s "$T")"
  printf "  first 100 chars: %s\n" "$(head -c 100 "$T" | tr -d "\n")"
else
  echo "  $T MISSING"
fi
echo "  es equivalent: $(stat -c %s .next/standalone/src/data/es/samples.json 2>/dev/null || echo missing) bytes"

echo
echo "=== is the text anywhere in the standalone tree ==="
if grep -rq "我是学生" .next/standalone 2>/dev/null; then
  echo "  YES"
  grep -rl "我是学生" .next/standalone 2>/dev/null | head -3 | sed "s|^|    |"
else
  echo "  NO - the build is serving stale data"
fi

echo
echo "=== stale artefacts (directory is not cleaned between builds) ==="
[ -d .next/standalone/public/public ] && echo "  public/public NESTED" || echo "  public: fine"
[ -d .next/standalone/.next/static/static ] && echo "  static/static NESTED" || echo "  static: fine"
'
