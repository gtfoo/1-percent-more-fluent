#!/usr/bin/env bash
# Send the Resend key to the droplet and turn magic-link sign-in on there.
#
#   bash scripts/enable-signin.sh          # report only
#   bash scripts/enable-signin.sh --write  # apply
#
# The key lives in the local .env.local and not on the server. It travels over
# the existing SSH connection and is never printed on either side.
set -eu
cd "$(dirname "$0")/.." || exit 1

KEY_LINE=$(grep -E '^[[:space:]]*AUTH_RESEND_KEY=' .env.local 2>/dev/null | tail -1 | sed 's/^[[:space:]]*//' || true)
if [ -z "$KEY_LINE" ]; then
  echo "no AUTH_RESEND_KEY in local .env.local - run scripts/wire-auth-local.sh first"
  exit 1
fi

scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i ~/.ssh/carpark_deploy \
  scripts/droplet-enable-signin.sh deploy@167.71.196.128:~/ >/dev/null

# droplet.sh probes with `ssh -n` precisely so that stdin survives to the real
# command; see the comment in that script.
printf '%s' "$KEY_LINE" | bash scripts/droplet.sh "bash ~/droplet-enable-signin.sh ${1:-}"
