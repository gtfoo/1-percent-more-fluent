#!/usr/bin/env bash
# The systemd unit is crash-looping on EADDRINUSE because the temporary nohup
# server from before it existed is still holding 3100. Identify the squatter,
# stop systemd so it stops racing, kill it, then start cleanly.
set -u
IP="${DROPLET_IP:-167.71.196.128}"
OPTS="-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"

ssh $OPTS -i ~/.ssh/carpark_deploy "root@$IP" 'bash -s' <<'REMOTE'
set -uo pipefail

echo "=== who owns 3100 right now ==="
ss -ltnp 2>/dev/null | grep ':3100 ' || echo "  nothing"

echo "=== all node processes for this app ==="
ps -eo pid,ppid,user,etimes,cmd | grep -E "1-percent-more-fluent|standalone/server" | grep -v grep || echo "  none"

echo
echo "=== stop systemd first, so it stops racing for the port ==="
systemctl stop fluent
sleep 2

echo "=== kill anything still on 3100 ==="
for pid in $(ss -ltnp 2>/dev/null | grep ':3100 ' | grep -oP 'pid=\K[0-9]+' | sort -u); do
  echo "  killing $pid ($(ps -o comm= -p "$pid" 2>/dev/null))"
  kill -9 "$pid" 2>/dev/null || true
done
sleep 2

if ss -ltn 2>/dev/null | grep -q ':3100 '; then
  echo "  STILL OCCUPIED - not starting" >&2
  ss -ltnp | grep ':3100 '
  exit 1
fi
echo "  3100 free"

echo
echo "=== start fluent cleanly ==="
systemctl reset-failed fluent 2>/dev/null || true
systemctl start fluent
sleep 6

echo "=== is it stable? (restart count must not move) ==="
A=$(systemctl show fluent -p NRestarts --value)
echo "  NRestarts now: $A"
sleep 15
B=$(systemctl show fluent -p NRestarts --value)
echo "  NRestarts after 15s: $B"
if [ "$A" = "$B" ]; then echo "  STABLE"; else echo "  STILL LOOPING" >&2; fi

echo
systemctl status fluent --no-pager -n 5 | head -10
curl -s -o /dev/null -m 10 -w "  app on 3100: %{http_code}\n" http://127.0.0.1:3100/
REMOTE
