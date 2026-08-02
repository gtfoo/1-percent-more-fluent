#!/usr/bin/env bash
#
# Build the currently checked-out commit and restart the service.
#
# The GitHub Actions "Deploy to droplet" workflow updates git first, then runs
# this over SSH. To deploy by hand on the droplet:
#
#     cd ~/1-percent-more-fluent && git pull --ff-only && bash scripts/deploy.sh
#
# Nothing here touches ./data — the SQLite file and the synthesised audio cache
# both live there, both are gitignored, and the audio in particular cost real
# money to produce. A deploy that hard-resets the working tree leaves it alone.
set -euo pipefail

# Repo root, regardless of where it is cloned or called from.
cd "$(dirname "$0")/.."

# Prefer nvm's Node 20 if this host uses nvm; otherwise fall back to the system
# Node on PATH (the droplet's deploy user has system Node 20, no nvm).
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null
fi

SERVICE="${FLUENT_SERVICE:-fluent}"

# The word lists are gitignored - ~1MB of rebuildable data - so a fresh clone
# has to build them before Next can trace the imports. Free: two public
# downloads and, for Chinese, one model call to vet the sampled items.
if [ ! -f src/data/es/frequency.json ]; then
  echo "==> building Spanish word data (first deploy)"
  npx tsx scripts/build-wordlist.ts
fi
if [ ! -f src/data/zh-CN/frequency.json ]; then
  echo "==> building Chinese word data (first deploy)"
  LANGUAGE=zh-CN npx tsx scripts/build-wordlist.ts
fi

echo "==> npm ci (recompiles better-sqlite3 for this host)"
npm ci

echo "==> next build"
npm run build

# `output: "standalone"` emits a server with only the node_modules it needs,
# but Next does not copy these two in - they have to be placed by hand.
echo "==> assembling standalone output"
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

echo "==> restarting ${SERVICE}"
sudo systemctl restart "${SERVICE}"

echo "==> deployed $(git rev-parse --short HEAD) on $(hostname)"
