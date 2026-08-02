#!/usr/bin/env bash
# Add the site block to the droplet's Caddyfile and reload.
#
# This box serves four other live sites, so: back up first, `caddy validate`
# before reloading, and restore the backup if validation fails. A bad reload
# would take gtfoo.com, carpark and career-side-quests down with it.
set -u
IP="${DROPLET_IP:-167.71.196.128}"
OPTS="-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"

ssh $OPTS -i ~/.ssh/carpark_deploy "root@$IP" 'bash -s' <<'REMOTE'
set -uo pipefail
HOST=1-percent-more-fluent.gtfoo.com
CADDYFILE=/etc/caddy/Caddyfile

echo "=== is the app actually up on 3100 first ==="
CODE=$(curl -s -o /dev/null -m 8 -w '%{http_code}' http://127.0.0.1:3100/ || echo 000)
echo "  app: $CODE"
if [ "$CODE" != "200" ]; then
  echo "  app is not serving; adding a proxy to nothing would give 502" >&2
  exit 1
fi

if grep -q "$HOST" "$CADDYFILE"; then
  echo "=== block already present, skipping append ==="
else
  BACKUP="$CADDYFILE.bak.$(date +%Y%m%d-%H%M%S)"
  cp "$CADDYFILE" "$BACKUP"
  echo "=== backed up to $BACKUP ==="

  printf '\n%s {\n    reverse_proxy localhost:3100\n}\n' "$HOST" >> "$CADDYFILE"
  echo "=== appended ==="

  if ! caddy validate --config "$CADDYFILE" 2>&1 | tail -3; then
    echo "  VALIDATION FAILED - restoring backup, nothing reloaded" >&2
    cp "$BACKUP" "$CADDYFILE"
    exit 1
  fi
fi

echo "=== reloading caddy ==="
systemctl reload caddy
sleep 6

echo "=== running config now knows ==="
curl -s --max-time 5 localhost:2019/config/ | grep -o '"[a-z0-9.-]*gtfoo\.com"' | sort -u | sed 's|^|  |'

echo "=== certificate ==="
for i in 1 2 3 4 5 6; do
  OUT=$(echo | timeout 10 openssl s_client -connect 127.0.0.1:443 -servername "$HOST" 2>&1)
  if grep -q "subject=" <<<"$OUT"; then
    grep -m1 'subject=' <<<"$OUT" | sed 's|^|  |'
    grep -m1 'issuer=' <<<"$OUT" | sed 's|^|  |'
    break
  fi
  echo "  waiting for issuance ($i)..."
  sleep 8
done

echo "=== end to end through caddy ==="
curl -s -o /dev/null -m 15 -w "  https: %{http_code}\n" "https://$HOST/" || echo "  failed"

echo "=== caddy log (last lines) ==="
journalctl -u caddy -n 12 --no-pager | grep -iE "error|obtain|certificate|$HOST" | tail -6 || true
REMOTE
