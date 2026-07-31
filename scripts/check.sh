#!/usr/bin/env bash
# Full pre-commit check: types, lint, production build.
set -u
cd "$(dirname "$0")/.." || exit 1
source ~/.nvm/nvm.sh >/dev/null 2>&1
nvm use 20 >/dev/null 2>&1

echo "--- tsc ---"
npx tsc --noEmit && echo "types ok"

echo "--- eslint ---"
npx eslint . && echo "lint ok"

echo "--- next build ---"
npx next build
echo "build exit: $?"
