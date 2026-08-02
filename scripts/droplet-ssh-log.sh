#!/usr/bin/env bash
# Did GitHub Actions ever reach the droplet? The auth log answers it from this
# side, without needing access to the Actions run log.
#
# Accepted publickey for deploy from an unfamiliar IP = the workflow ran and
# authenticated. Nothing at all = the workflow never got here, so the problem is
# upstream: secrets missing, or the workflow not firing.
set -u
IP="${DROPLET_IP:-167.71.196.128}"
OPTS="-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"

ssh $OPTS -i ~/.ssh/carpark_deploy "root@$IP" 'bash -s' <<'REMOTE'
echo "=== ssh logins in the last hour ==="
journalctl -u ssh --since "1 hour ago" --no-pager 2>/dev/null \
  | grep -Ei "Accepted|Failed|Invalid" | tail -20 || echo "  none"

echo
echo "=== which key fingerprints were used ==="
journalctl -u ssh --since "1 hour ago" --no-pager 2>/dev/null \
  | grep -oP 'Accepted publickey for \K\S+.*?SHA256:\S+' | sort | uniq -c | tail -10 || echo "  none"

echo
echo "=== git remote + last fetch on the droplet ==="
cd /home/deploy/1-percent-more-fluent
git rev-parse --short HEAD | sed 's|^|  HEAD: |'
git log -1 --pretty='  %h %s' origin/main 2>/dev/null | sed 's|^|  origin/main: |' || echo "  no origin/main ref"
stat -c '  .git/FETCH_HEAD last modified: %y' .git/FETCH_HEAD 2>/dev/null || echo "  never fetched"
REMOTE
