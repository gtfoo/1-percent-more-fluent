#!/usr/bin/env bash
# Full pre-commit check: types, lint, model checks, production build.
#
# The model checks run here rather than being optional extras: the placement
# scorer shipped untested and rated an A2/B1 learner as C2, and the calibration
# controller then pushed them further up. Neither failure was visible from
# types or lint.
set -u
cd "$(dirname "$0")/.." || exit 1
source ~/.nvm/nvm.sh >/dev/null 2>&1
nvm use 20 >/dev/null 2>&1

fail=0
step() {
  echo "--- $1 ---"
  shift
  if "$@"; then :; else fail=1; echo "^^ FAILED"; fi
}

step tsc npx tsc --noEmit
step eslint npx eslint .
step "placement scoring" npx tsx scripts/check-placement.ts
step "calibration" npx tsx scripts/check-calibration.ts
step "language contract" npx tsx scripts/check-language.ts
step "profile migration" npx tsx scripts/check-migration.ts
step "topic terms" npx tsx scripts/check-terms.ts
step "dialogue turns" npx tsx scripts/check-dialogue.ts
step "model chain" npx tsx scripts/check-llm-chain.ts
step "next build" npx next build

echo
if [ "$fail" -eq 0 ]; then echo "all checks passed"; else echo "SOME CHECKS FAILED"; fi
exit "$fail"
