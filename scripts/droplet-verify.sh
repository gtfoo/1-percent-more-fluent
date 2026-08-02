#!/usr/bin/env bash
# End-to-end verification of the deployed service: persistence, reboot-safety,
# the deploy user's restart permission, and the public URL.
set -u
IP="${DROPLET_IP:-167.71.196.128}"
OPTS="-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"

ssh $OPTS -i ~/.ssh/carpark_deploy "deploy@$IP" 'bash -s' <<'REMOTE'
set -uo pipefail
cd /home/deploy/1-percent-more-fluent

echo "=== service ==="
echo "  active:  $(systemctl is-active fluent)"
echo "  enabled: $(systemctl is-enabled fluent)   <- survives reboot"
echo "  restarts: $(systemctl show fluent -p NRestarts --value)"

echo
echo "=== persistent paths (the thing that silently breaks) ==="
PID=$(systemctl show fluent -p MainPID --value)
tr "\0" "\n" < /proc/$PID/environ 2>/dev/null | grep -E "^(DATA_DIR|PORT|NODE_ENV)=" | sed "s|^|  |"
echo "  database:"
find /home/deploy/1-percent-more-fluent -name "fluent.sqlite" 2>/dev/null | sed "s|^|    |"
echo "  stray copy inside build output (must be empty):"
find .next/standalone -name "*.sqlite*" 2>/dev/null | sed "s|^|    |"

echo
echo "=== can the deploy user restart it? (GitHub Actions needs this) ==="
if sudo -n systemctl restart fluent 2>/dev/null; then
  sleep 5
  echo "  restart via sudo: OK, now $(systemctl is-active fluent)"
else
  echo "  restart via sudo: DENIED - Actions cannot deploy" >&2
fi

echo
echo "=== through caddy, from the box ==="
curl -s -o /dev/null -m 15 -w "  https local: %{http_code}\n" https://1-percent-more-fluent.gtfoo.com/
REMOTE

echo
echo "=== from here, over the public internet ==="
curl -s -o /dev/null -m 20 -w "  https public: %{http_code}\n" https://1-percent-more-fluent.gtfoo.com/
curl -s -m 20 https://1-percent-more-fluent.gtfoo.com/setup | grep -o "What are you learning?\|Simplified Chinese\|Spanish" | sort -u | sed 's|^|  |'
