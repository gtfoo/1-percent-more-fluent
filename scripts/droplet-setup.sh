#!/usr/bin/env bash
# Everything the deploy user CAN do: clone, configure, install, build.
#
# The root-only remainder (systemd unit, sudoers line, Caddy block) is printed
# at the end for someone with sudo to paste.
set -u
cd "$(dirname "$0")" || exit 1

APP_DIR=/home/deploy/1-percent-more-fluent

# Keys are read from the local .env.local and piped over SSH; they are never
# echoed, and never land in a shell history or an argv on either side.
GOOGLE_KEY=$(grep -m1 '^GOOGLE_GENERATIVE_AI_API_KEY=' ../.env.local | cut -d= -f2-)
ELEVEN_KEY=$(grep -m1 '^ELEVENLABS_API_KEY=' ../.env.local | cut -d= -f2-)
if [ -z "$GOOGLE_KEY" ] || [ -z "$ELEVEN_KEY" ]; then
  echo "could not read both API keys from ../.env.local" >&2
  exit 1
fi

bash ./droplet.sh "
set -e
APP_DIR=$APP_DIR

if [ ! -d \"\$APP_DIR/.git\" ]; then
  echo '=== cloning ==='
  git clone --quiet https://github.com/gtfoo/1-percent-more-fluent.git \"\$APP_DIR\"
else
  echo '=== already cloned, updating ==='
  cd \"\$APP_DIR\" && git fetch --quiet origin main && git reset --hard --quiet origin/main
fi

cd \"\$APP_DIR\"
echo \"at \$(git rev-parse --short HEAD)\"

echo '=== writing .env.local ==='
umask 077
cat > .env.local <<ENVEOF
GOOGLE_GENERATIVE_AI_API_KEY=$GOOGLE_KEY
ELEVENLABS_API_KEY=$ELEVEN_KEY
ENVEOF
chmod 600 .env.local
echo \"  wrote \$(wc -l < .env.local) lines, mode \$(stat -c %a .env.local)\"
"
