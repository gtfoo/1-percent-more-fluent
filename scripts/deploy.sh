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
if [ ! -f src/data/id/frequency.json ]; then
  echo "==> building Indonesian word data (first deploy)"
  LANGUAGE=id npx tsx scripts/build-wordlist.ts
fi

echo "==> npm ci (recompiles better-sqlite3 for this host)"
npm ci

# THE SITE IS BROKEN WHILE THIS RUNS, for the length of a build - a few minutes.
# `.next` is removed, so the running server's own directory is gone: pages still
# answer 200 while every asset fails, and the reader sees unstyled markup.
#
# Two cheaper fixes were tried and both measured as failures, in
# scripts/try-swap-deploy.sh:
#
#   - Park the old build under another name and swap at the end. A renamed
#     .next leaves the server serving pages but 500ing every asset, so Next
#     resolves static files through an absolute path fixed at startup, not
#     through its working directory.
#   - Clear only .next/cache, so the serving files survive. `next build`
#     rewrites .next/static regardless: the asset was unavailable for 11 of the
#     12 seconds sampled.
#
# Removing the window entirely means the live server must not read from the
# directory being rebuilt - a releases/<sha> directory with a `current` symlink,
# which needs the systemd unit changed and therefore root. Until then the
# verification at the bottom makes a deploy that ends broken fail loudly, which
# is the part that actually cost something.
#
# Clean, not incremental. Turbopack's cache served a STALE copy of a committed
# JSON import here: src/data/zh-CN/samples.json was correct on disk, the build
# inlined the empty placeholder it had cached from a previous commit, and the
# read-back step silently vanished from the live site while every other part of
# the deploy reported success.
#
# It also makes the two copies below correct. `cp -r a b` when b already exists
# copies INTO it, so repeated deploys were producing public/public.
echo "==> next build (clean)"
rm -rf .next
npm run build

# `output: "standalone"` emits a server with only the node_modules it needs,
# but Next does not copy these two in - they have to be placed by hand.
echo "==> assembling standalone output"
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

echo "==> restarting ${SERVICE}"
sudo systemctl restart "${SERVICE}"

# Prove the site actually works before calling this a success.
#
# `rm -rf .next` above means that for the whole length of the build the
# standalone server's directory does not exist: the HTML still returns 200 while
# every stylesheet and script fails, and the site renders as bare unstyled
# markup. That window is expected and self-healing - but a deploy that ends
# with it PERMANENTLY looks identical, and nothing here noticed. It shipped
# twice before a person did.
#
# Status codes alone are useless for this. The page is 200 either way; what
# matters is whether the assets it references load.
echo "==> verifying"
bash "$(dirname "$0")/verify-serving.sh"

echo "==> deployed $(git rev-parse --short HEAD) on $(hostname)"
