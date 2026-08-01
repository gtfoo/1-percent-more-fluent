#!/usr/bin/env bash
# Set every profile's level directly.  Usage: bash scripts/set-level.sh 38
#
# An escape hatch for the operator, distinct from the in-app one: useful when a
# stored estimate is badly wrong and you want to fix it without going through
# the UI.
set -eu
cd "$(dirname "$0")/.." || exit 1
source ~/.nvm/nvm.sh >/dev/null 2>&1
nvm use 20 >/dev/null 2>&1

LEVEL="${1:?usage: set-level.sh <0-100>}"

LEVEL="$LEVEL" npx tsx -e '
const Database = require("better-sqlite3");
const { cefrFor, paramsFor } = require("./src/lib/level.ts");
const level = Number(process.env.LEVEL);
const db = new Database("data/fluent.sqlite");
const before = db.prepare("SELECT user_id, level FROM profiles").all();
db.prepare("UPDATE profiles SET level = ?, updated_at = ?").run(level, new Date().toISOString());
for (const row of before) {
  console.log(`${row.user_id.slice(0, 8)}  ${row.level.toFixed(1)} -> ${level}`);
}
const p = paramsFor(level);
console.log(`now ${cefrFor(level)}, about ${p.vocabBand.toLocaleString()} words, ~${p.sentenceWords}-word sentences`);
'
