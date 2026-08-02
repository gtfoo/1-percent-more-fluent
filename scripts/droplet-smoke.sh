#!/usr/bin/env bash
# Start the standalone server on the droplet exactly as the systemd unit will,
# hit it, then stop it again. Proves the build runs before anyone with root
# commits to a unit file.
set -u
cd "$(dirname "$0")" || exit 1

bash ./droplet.sh '
set -u
cd /home/deploy/1-percent-more-fluent

pkill -f "standalone/server.j[s]" >/dev/null 2>&1
sleep 1

set -a; . ./.env.local; set +a
DATA_DIR=/home/deploy/1-percent-more-fluent/data \
NODE_ENV=production PORT=3100 HOSTNAME=127.0.0.1 \
  setsid nohup node .next/standalone/server.js > /tmp/fluent-smoke.log 2>&1 < /dev/null &

for i in $(seq 1 30); do
  sleep 1
  [ "$(curl -s -o /dev/null -w %{http_code} http://127.0.0.1:3100/ || true)" = "200" ] && break
done

echo "=== home ==="
curl -s -o /dev/null -w "  status %{http_code}\n" http://127.0.0.1:3100/
echo "=== setup page ==="
curl -s --max-time 10 http://127.0.0.1:3100/setup | grep -o "What are you learning?\|Simplified Chinese\|Spanish" | sort -u | head -3
echo "=== data dir created in the right place? ==="
ls -la data 2>/dev/null | head -4
echo "  stray db inside build output:"
find .next/standalone -name "*.sqlite*" 2>/dev/null | head -2
echo "  (nothing above = correct)"
echo "=== log ==="
tail -3 /tmp/fluent-smoke.log

pkill -f "standalone/server.j[s]" >/dev/null 2>&1
echo "=== stopped ==="
'
