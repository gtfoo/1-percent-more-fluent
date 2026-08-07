#!/usr/bin/env bash
# Where might the Resend key have landed? Names only, never values.
set -u

echo "--- local env files, this project ---"
for f in ~/Git/1-percent-more-fluent/.env.local ~/Git/1-percent-more-fluent/.env; do
  [ -f "$f" ] && echo "  $f: $(grep -c 'AUTH_' "$f" 2>/dev/null) AUTH_ lines" || echo "  $f: (absent)"
done

echo "--- the sibling project that already has sign-in working ---"
f=~/Git/career-side-quests/.env.local
if [ -f "$f" ]; then
  echo "  $f:"
  grep -oE '^[[:space:]]*AUTH_[A-Z_]+' "$f" | tr -d ' ' | sed 's/^/    /'
else
  echo "  (absent)"
fi

echo "--- exported in this shell? ---"
for v in AUTH_SECRET AUTH_RESEND_KEY; do
  if [ -n "${!v:-}" ]; then echo "  $v is exported"; else echo "  $v not exported"; fi
done
