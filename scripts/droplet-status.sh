#!/usr/bin/env bash
# Read-only: is the app up, is systemd running it, does Caddy know the host?
set -u
cd "$(dirname "$0")" || exit 1

bash ./droplet.sh '
echo "=== is anything serving on 3100 ==="
ss -ltn 2>/dev/null | grep 3100 || echo "  NOTHING on 3100"
curl -s -o /dev/null -m 8 -w "  direct curl: status %{http_code}\n" http://127.0.0.1:3100/ || echo "  direct curl failed"

echo
echo "=== who owns 3100 ==="
ps -eo pid,etime,cmd 2>/dev/null | grep -E "standalone/server|next" | grep -v grep | head -5 || echo "  no node process"

echo
echo "=== fluent unit ==="
if systemctl cat fluent >/dev/null 2>&1; then
  echo "  unit EXISTS"
  systemctl is-enabled fluent 2>/dev/null | sed "s|^|  enabled: |"
  systemctl is-active fluent 2>/dev/null | sed "s|^|  active: |"
  systemctl status fluent --no-pager -n 12 2>/dev/null | tail -14
else
  echo "  unit DOES NOT EXIST - the root step has not been run"
fi

echo
echo "=== sudoers for fluent ==="
sudo -n -l 2>/dev/null | grep -i fluent || echo "  no NOPASSWD entry for fluent"

echo
echo "=== Caddy: does it know the hostname ==="
grep -c "1-percent-more-fluent" /etc/caddy/Caddyfile 2>/dev/null | sed "s|^|  matches in Caddyfile: |" || echo "  cannot read Caddyfile"
curl -s --max-time 5 localhost:2019/config/ 2>/dev/null | grep -o "\"[a-z0-9.-]*gtfoo\.com\"" | sort -u | sed "s|^|  running: |"

echo
echo "=== through Caddy locally ==="
curl -s -o /dev/null -m 10 -w "  https via loopback: %{http_code}\n" -k -H "Host: 1-percent-more-fluent.gtfoo.com" https://127.0.0.1/ 2>&1 || echo "  failed"
'
