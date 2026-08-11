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

# The shared droplet lock. Four apps build on one 1 vCPU box, and two concurrent
# builds collided on 2026-08-07 and nearly hit the OOM killer - carpark and this
# app, which was the pairing still unprotected until now.
#
# A lock is only as good as its worst adopter: carpark and career-side-quests
# both took this correctly, and it bought them nothing against us, because our
# builds went straight through theirs. The path and mode are fixed by
# ~/Git/INFRA.md and must match exactly - separately-named locks never contend,
# which is how the original collision happened.
#
# Taken before `npm ci` so the whole expensive stretch is inside it. An
# unopenable lock warns and proceeds: failing to serialise is bad, failing to
# deploy is worse. Never `rm` this file.
LOCK=/var/lock/droplet-deploy.lock
if { touch "$LOCK" && chmod 0666 "$LOCK"; } 2>/dev/null || [ -w "$LOCK" ]; then
  exec 9>>"$LOCK"
  flock -w 1800 9 \
    || { echo "!! another deploy held $LOCK for 30m — aborting" >&2; exit 1; }
else
  echo "!! WARNING: cannot open $LOCK — proceeding WITHOUT serialisation" >&2
fi

# No nvm block. It used to `nvm use 20` when nvm was present, which was worse
# than dead code: the droplet has no nvm so it never fired there, but it DOES
# fire on a dev machine that has one - pinning that build to Node 20 while
# production runs 22.23.2 (ABI 127). Whatever Node is on PATH is the one
# production uses; the guard below checks the addons actually match it.

SERVICE="${FLUENT_SERVICE:-fluent}"

# The word lists are committed now, so these branches are a safety net rather
# than a step. They used to be the step, and that was a billing hazard waiting
# for a CI migration: a fresh runner always looks like a first deploy, and the
# Chinese build spends a model call vetting its sampled items. It was also a
# correctness hazard - running build-wordlist for zh-CN would overwrite the HSK
# placement bands with frequency ones, silently undoing the whole point of them.
#
# If one of these ever does fire, something has gone wrong with the checkout;
# say so rather than quietly rebuilding a megabyte of data mid-deploy.
for lang in es zh-CN id; do
  if [ ! -f "src/data/$lang/frequency.json" ]; then
    echo "!! src/data/$lang/frequency.json is missing from the checkout." >&2
    echo "!! It is committed - this should not happen. Rebuild deliberately with" >&2
    echo "!!   LANGUAGE=$lang npm run wordlist" >&2
    echo "!! and check scripts/build-hsk.ts afterwards if this was zh-CN." >&2
    exit 1
  fi
done

echo "==> npm ci (recompiles better-sqlite3 for this host)"
npm ci

# Prove the native addon actually loads under this host's Node before spending
# minutes on a build. `require()` is NOT enough and was the version of this
# guard published first: better-sqlite3 loads its binary inside the Database
# constructor, so on a genuine ABI mismatch `require` exits 0, the deploy
# reports success, and the site 500s on its first database request. Constructing
# something is the whole point.
#
# `:memory:` opens no file and touches no live database.
echo "==> checking better-sqlite3 loads under $(node -v)"
node -e "new (require('better-sqlite3'))(':memory:').close()" \
  || { echo "!! better-sqlite3 cannot load under $(node -v) — ABI mismatch" >&2; exit 1; }

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
