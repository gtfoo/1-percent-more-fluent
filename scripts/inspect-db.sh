#!/usr/bin/env bash
# Quick look at what the app has stored. Read-only.
set -u
cd "$(dirname "$0")/.." || exit 1
source ~/.nvm/nvm.sh >/dev/null 2>&1
nvm use 20 >/dev/null 2>&1

npx tsx -e '
const Database = require("better-sqlite3");
const db = new Database("data/comprensible.sqlite", { readonly: true });
for (const p of db.prepare("SELECT id, title, level, model, report FROM pieces ORDER BY created_at DESC LIMIT 3").all()) {
  const r = JSON.parse(p.report);
  console.log(`\n${p.title}  [${p.model}]  level=${p.level.toFixed(1)}`);
  console.log(`  words=${r.totalWords} outOfBand=${(r.outOfBandRate*100).toFixed(1)}% meanSentence=${r.meanSentenceWords.toFixed(1)} passes=${r.passes}`);
  console.log(`  beyond band: ${r.outOfBand.slice(0,15).join(", ")}`);
  if (r.problems.length) console.log(`  problems: ${r.problems.join(" | ")}`);
}
console.log("\nprofiles:", JSON.stringify(db.prepare("SELECT level, vocab_estimate FROM profiles").all()));
console.log("gloss cache:", db.prepare("SELECT COUNT(*) n FROM gloss_cache").get().n, "entries");
console.log("audio:", JSON.stringify(db.prepare("SELECT COALESCE(SUM(characters),0) chars, COUNT(*) n FROM audio").get()));
'
