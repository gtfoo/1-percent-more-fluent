#!/usr/bin/env bash
# Run ON the droplet. What is Auth.js actually complaining about?
set -u
echo "--- auth errors, most recent last ---"
journalctl -u fluent -n 400 --no-pager 2>/dev/null \
  | grep -iE '\[auth\]\[(error|warn)\]' \
  | grep -v 'experimental-webauthn' \
  | tail -25

echo
echo "--- anything else that looks like a failure ---"
journalctl -u fluent -n 400 --no-pager 2>/dev/null \
  | grep -iE 'error|⨯|throw|Configuration|UntrustedHost|Missing' \
  | grep -viE 'experimental-webauthn|\[auth\]\[error\]' \
  | tail -15

echo
echo "--- which auth variables the SERVICE actually has ---"
pid=$(systemctl show fluent -p MainPID --value)
if [ -n "$pid" ] && [ "$pid" != 0 ]; then
  tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null \
    | grep -oE '^AUTH_[A-Z_]+' | sort | sed 's/^/  /'
else
  echo "  (no pid)"
fi

echo
echo "--- what the endpoints say right now ---"
S=https://1-percent-more-fluent.gtfoo.com
for p in /api/auth/providers /api/auth/session /signin; do
  printf '  %s  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$S$p")" "$p"
done
echo "  providers: $(curl -s "$S/api/auth/providers" | head -c 300)"
