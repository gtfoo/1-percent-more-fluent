#!/usr/bin/env bash
# Which commit is deployed, and is it healthy?
#
#   bash scripts/droplet-head.sh            # report
#   bash scripts/droplet-head.sh <sha>      # exit 0 only if THAT sha is deployed
#
# The second form exists because a plain `grep <sha>` over the report matches
# the local HEAD line too, which once made a polling loop declare success while
# the droplet had not moved at all.
set -u
cd "$(dirname "$0")" || exit 1
WANT="${1:-}"

DEPLOYED=$(bash ./droplet.sh 'cd /home/deploy/1-percent-more-fluent && git rev-parse --short HEAD' 2>/dev/null | tail -1)

if [ -n "$WANT" ]; then
  [ "$DEPLOYED" = "$WANT" ]
  exit $?
fi

bash ./droplet.sh '
cd /home/deploy/1-percent-more-fluent
echo "deployed commit : $(git rev-parse --short HEAD)  $(git log -1 --pretty=%s | cut -c1-52)"
echo "service         : $(systemctl is-active fluent) / $(systemctl is-enabled fluent)"
echo "restarts        : $(systemctl show fluent -p NRestarts --value)"
printf "local http      : "
curl -s -o /dev/null -m 8 -w "%{http_code}\n" http://127.0.0.1:3100/
'
echo -n "public https    : "
curl -s -o /dev/null -m 20 -w "%{http_code}\n" https://1-percent-more-fluent.gtfoo.com/
echo -n "local repo HEAD : "
git -C .. rev-parse --short HEAD
