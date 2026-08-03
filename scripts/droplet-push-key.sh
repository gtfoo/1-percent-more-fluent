#!/usr/bin/env bash
# Copy one secret from the local .env.local to the droplet's, then restart.
#
#   bash scripts/droplet-push-key.sh ANTHROPIC_API_KEY
#
# The value is never printed, never passed as a command-line argument (it would
# be visible in the remote process list), and never interpolated into a string
# this script builds - it goes over stdin and straight into the file. What gets
# reported is the variable NAME and whether it landed.
#
# Idempotent: a variable already present on the droplet is replaced rather than
# appended, so running this twice does not leave two conflicting lines - and
# systemd's EnvironmentFile parser would take the LAST one, which is a horrible
# thing to debug.
set -u

VAR="${1:-}"
if [ -z "$VAR" ]; then
  echo "usage: droplet-push-key.sh <VAR_NAME>" >&2
  exit 1
fi

cd "$(dirname "$0")/.." || exit 1
LOCAL=.env.local
REMOTE=/home/deploy/1-percent-more-fluent/.env.local

if ! grep -q "^${VAR}=" "$LOCAL" 2>/dev/null; then
  echo "no ${VAR} in ${LOCAL}" >&2
  exit 1
fi

# Non-empty check without revealing anything: just the length.
LEN=$(grep "^${VAR}=" "$LOCAL" | head -1 | sed "s/^${VAR}=//" | tr -d '\r\n' | wc -c)
if [ "$LEN" -lt 8 ]; then
  echo "${VAR} in ${LOCAL} looks empty (${LEN} chars)" >&2
  exit 1
fi
echo "local  : ${VAR} present, ${LEN} chars"

# Send the whole line over stdin. `cat` on the far side writes it to a temp
# file, then the remote script rewrites .env.local without the old value.
grep "^${VAR}=" "$LOCAL" | head -1 | tr -d '\r' | bash scripts/droplet.sh "
  set -e
  cat > /tmp/newkey
  touch ${REMOTE}
  grep -v '^${VAR}=' ${REMOTE} > /tmp/env.rest || true
  cat /tmp/env.rest /tmp/newkey > ${REMOTE}
  chmod 600 ${REMOTE}
  shred -u /tmp/newkey /tmp/env.rest 2>/dev/null || rm -f /tmp/newkey /tmp/env.rest
  echo \"droplet: \$(grep -c '^${VAR}=' ${REMOTE}) line(s) for ${VAR}, \$(wc -c < ${REMOTE}) bytes total\"
"

echo "restarting..."
bash scripts/droplet.sh 'sudo systemctl restart fluent && sleep 3 && systemctl is-active fluent'
