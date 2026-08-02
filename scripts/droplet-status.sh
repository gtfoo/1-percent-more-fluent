#!/usr/bin/env bash
# Read-only: how is carpark laid out, and what may the deploy user do?
set -u
cd "$(dirname "$0")" || exit 1

bash ./droplet.sh '
echo "=== carpark.service (the pattern to copy) ==="
systemctl cat carpark --no-pager 2>/dev/null | grep -vE "^#" | head -30
echo
echo "=== where do the apps live ==="
ls -d /home/*/ /srv/* /opt/* 2>/dev/null | head -10
find /home /srv /opt -maxdepth 3 -name "package.json" -not -path "*/node_modules/*" 2>/dev/null | head -6
echo
echo "=== sudo rights for deploy ==="
sudo -n -l 2>&1 | tail -12
echo
echo "=== swap (next build on 1GB needs it) ==="
free -m | tail -1
swapon --show 2>/dev/null || echo "  NO SWAP CONFIGURED"
echo
echo "=== node ==="
node -v 2>/dev/null; which node
'
