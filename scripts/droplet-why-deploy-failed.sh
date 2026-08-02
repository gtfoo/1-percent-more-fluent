#!/usr/bin/env bash
# The workflow authenticated and fetched, then HEAD did not move. Reproduce the
# steps it runs, as the user it runs them as, and let the failure speak.
set -u
cd "$(dirname "$0")" || exit 1

bash ./droplet.sh '
cd /home/deploy/1-percent-more-fluent

echo "=== who owns what (a root-owned file would break git reset for deploy) ==="
find . -maxdepth 2 -not -user deploy -not -path "./node_modules/*" -not -path "./.git/*" 2>/dev/null | head -10 || true
echo "  (nothing listed = all deploy-owned)"

echo
echo "=== refs ==="
echo "  HEAD:        $(git rev-parse --short HEAD)"
echo "  origin/main: $(git rev-parse --short origin/main 2>/dev/null || echo unknown)"

echo
echo "=== dry run of exactly what the workflow does ==="
echo "--- git fetch ---"
git fetch origin main 2>&1 | tail -3
echo "--- git reset --hard origin/main ---"
git reset --hard origin/main 2>&1 | tail -5
echo "  HEAD now: $(git rev-parse --short HEAD)"

echo
echo "=== can deploy restart the service? (last line of deploy.sh) ==="
sudo -n systemctl restart fluent && echo "  restart OK" || echo "  restart DENIED"
'
