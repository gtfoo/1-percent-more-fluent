#!/usr/bin/env bash
# Install the systemd unit and the deploy-user sudoers entry. Root.
#
# Deliberately does not touch Caddy - that is a separate step, because a bad
# Caddy reload would take down the four sites already on this box.
set -u
IP="${DROPLET_IP:-167.71.196.128}"
OPTS="-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"

ssh $OPTS -i ~/.ssh/carpark_deploy "root@$IP" 'bash -s' <<'REMOTE'
set -euo pipefail

echo "=== writing /etc/systemd/system/fluent.service ==="
cat > /etc/systemd/system/fluent.service <<'UNIT'
[Unit]
Description=1 Percent More Fluent
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/1-percent-more-fluent
EnvironmentFile=/home/deploy/1-percent-more-fluent/.env.local

# DATA_DIR must point OUTSIDE the build output: the standalone server chdir's
# into .next/standalone, which every rebuild replaces, so relying on the
# working directory would silently start from an empty database each deploy.
Environment=DATA_DIR=/home/deploy/1-percent-more-fluent/data
Environment=NODE_ENV=production
Environment=PORT=3100
Environment=HOSTNAME=127.0.0.1

ExecStart=/usr/bin/node .next/standalone/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

echo "=== sudoers so GitHub Actions can restart it ==="
# Validate into a temp file first; a malformed sudoers file breaks sudo entirely.
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart fluent' > /tmp/fluent-sudoers
if visudo -c -f /tmp/fluent-sudoers; then
  install -m 440 /tmp/fluent-sudoers /etc/sudoers.d/fluent-deploy
  rm -f /tmp/fluent-sudoers
  echo "  installed"
else
  echo "  SUDOERS INVALID - not installed" >&2
  exit 1
fi
visudo -c >/dev/null && echo "  sudoers overall: OK"

echo "=== handing port 3100 from the temporary process to systemd ==="
pkill -f "standalone/server.j[s]" || true
sleep 2

systemctl daemon-reload
systemctl enable --now fluent
sleep 4

echo "=== state ==="
systemctl is-enabled fluent | sed 's|^|  enabled: |'
systemctl is-active fluent  | sed 's|^|  active: |'
curl -s -o /dev/null -m 10 -w "  app on 3100: %{http_code}\n" http://127.0.0.1:3100/ || echo "  app not answering"
systemctl status fluent --no-pager -n 6 | tail -8
REMOTE
