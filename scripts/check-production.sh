#!/usr/bin/env bash
# Verify the live site serves what the current commit says it should.
set -u
BASE="${BASE:-https://1-percent-more-fluent.gtfoo.com}"

check_samples() {
  local lang="$1"
  local json
  json=$(curl -s -m 25 "$BASE/api/placement?language=$lang")
  local items levels
  items=$(printf '%s' "$json" | grep -o '"items":\[' | wc -l)
  # Levels only appear inside the samples array.
  levels=$(printf '%s' "$json" | grep -o '"level":[0-9]*' | sed 's/"level"://' | tr '\n' ' ')
  printf '  %-6s items:%s  sample levels: %s\n' "$lang" "$items" "${levels:-NONE}"
}

echo "=== placement API ==="
check_samples es
check_samples zh-CN

echo
echo "=== a Chinese sample actually reaches the browser ==="
if curl -s -m 25 "$BASE/api/placement?language=zh-CN" | grep -q '我是学生'; then
  echo "  found the level-10 text"
else
  echo "  NOT FOUND"
fi

echo
echo "=== pages ==="
for p in / /setup; do
  printf '  %-8s %s\n' "$p" "$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$BASE$p")"
done
