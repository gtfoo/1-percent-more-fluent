#!/usr/bin/env bash
# Install, build the word data, and build the app on the droplet.
# Slow on 1 vCPU; the 2GB swap file is what keeps `next build` from being OOM-killed.
set -u
cd "$(dirname "$0")" || exit 1

bash ./droplet.sh '
set -e
cd /home/deploy/1-percent-more-fluent

echo "=== npm ci (recompiles better-sqlite3) ==="
npm ci --no-audit --no-fund 2>&1 | tail -3

echo "=== word data ==="
[ -f src/data/es/frequency.json ] || npx tsx scripts/build-wordlist.ts 2>&1 | tail -2
[ -f src/data/zh-CN/frequency.json ] || LANGUAGE=zh-CN npx tsx scripts/build-wordlist.ts 2>&1 | tail -2
ls -la src/data/es src/data/zh-CN 2>/dev/null | grep -E "frequency|placement|anchors|samples" | head -10

echo "=== next build ==="
npm run build 2>&1 | tail -6

echo "=== assembling standalone ==="
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
ls .next/standalone/server.js && echo "  standalone server present"
'
