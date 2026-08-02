#!/usr/bin/env bash
# Create a deploy key used ONLY by this repo's GitHub Actions.
#
#   bash scripts/droplet-new-deploy-key.sh
#
# Purely additive: it appends one public key to the deploy user's
# authorized_keys and touches nothing else. carpark, gtfoo.com and
# career-side-quests are unaffected.
#
# Deliberately NOT added to root's authorized_keys. A CI credential should
# reach exactly the account it needs and no more - which is the difference
# between this key and the one carpark's Actions currently uses.
#
# The private key is never printed. It stays in ~/.ssh and is piped straight
# into the GitHub secret by the command shown at the end.
set -euo pipefail

IP="${DROPLET_IP:-167.71.196.128}"
KEY=~/.ssh/fluent_deploy
COMMENT="gh-actions-1-percent-more-fluent"
OPTS="-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"

if [ -f "$KEY" ]; then
  echo "=== $KEY already exists, reusing it ==="
else
  echo "=== generating $KEY ==="
  # No passphrase: GitHub Actions cannot unlock one non-interactively.
  ssh-keygen -t ed25519 -N "" -C "$COMMENT" -f "$KEY" >/dev/null
  chmod 600 "$KEY"
fi
ssh-keygen -lf "$KEY.pub" | sed 's|^|  |'

PUB=$(cat "$KEY.pub")

echo
echo "=== installing the public half for the deploy user only ==="
# Connect with the existing key that already reaches deploy.
ssh $OPTS -i ~/.ssh/carpark_deploy "deploy@$IP" "bash -s" <<REMOTE
set -euo pipefail
mkdir -p ~/.ssh && chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
if grep -qF "$PUB" ~/.ssh/authorized_keys; then
  echo "  already present"
else
  printf '%s\n' "$PUB" >> ~/.ssh/authorized_keys
  echo "  appended"
fi
echo "  deploy now authorises:"
ssh-keygen -lf ~/.ssh/authorized_keys | sed 's|^|    |'
REMOTE

echo
echo "=== verifying least privilege ==="
printf '  new key -> deploy : '
ssh $OPTS -i "$KEY" "deploy@$IP" 'echo OK as $(id -un)' 2>/dev/null || echo "FAILED (it must work)"
printf '  new key -> root   : '
if ssh $OPTS -i "$KEY" "root@$IP" 'echo reached root' 2>/dev/null; then
  echo "  ^^ UNEXPECTED: this key should not reach root" >&2
else
  echo "denied (correct)"
fi

echo
echo "=== add it to this repo's secrets, without the key ever being displayed ==="
cat <<'HOWTO'
  gh auth login
  gh secret set DROPLET_SSH_KEY  -R gtfoo/1-percent-more-fluent < ~/.ssh/fluent_deploy
  gh secret set DROPLET_HOST     -R gtfoo/1-percent-more-fluent --body '167.71.196.128'
  gh secret set DROPLET_USER     -R gtfoo/1-percent-more-fluent --body 'deploy'
  gh secret set DROPLET_APP_DIR  -R gtfoo/1-percent-more-fluent --body '/home/deploy/1-percent-more-fluent'

  gh secret list -R gtfoo/1-percent-more-fluent
HOWTO
