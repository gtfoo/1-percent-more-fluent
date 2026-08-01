#!/usr/bin/env bash
# Quick look at what the app has stored. Read-only.
set -u
cd "$(dirname "$0")/.." || exit 1
source ~/.nvm/nvm.sh >/dev/null 2>&1
nvm use 20 >/dev/null 2>&1

npx tsx -e '
const Database = require("better-sqlite3");
const db = new Database("data/fluent.sqlite", { readonly: true });

console.log("=== profiles ===");
for (const p of db.prepare("SELECT user_id, level, vocab_estimate, placed_at FROM profiles").all()) {
  console.log(`  ${p.user_id.slice(0,8)}  level=${p.level.toFixed(1)}  vocabEstimate=${p.vocab_estimate}  placed=${(p.placed_at||"").slice(0,19)}`);
}

console.log("\n=== sessions (oldest first) ===");
const rows = db.prepare("SELECT * FROM sessions ORDER BY created_at").all();
if (!rows.length) console.log("  none");
for (const s of rows) {
  const piece = db.prepare("SELECT title, level, report FROM pieces WHERE id = ?").get(s.piece_id);
  const words = piece ? JSON.parse(piece.report).totalWords : 0;
  const looked = Math.round(s.lookup_rate * words);
  console.log(
    `  ${s.created_at.slice(5,19)}  ${s.user_id.slice(0,8)}  ` +
    `${s.level_before.toFixed(1).padStart(5)} -> ${s.level_after.toFixed(1).padStart(5)} ` +
    `(${(s.level_after - s.level_before >= 0 ? "+" : "")}${(s.level_after - s.level_before).toFixed(1)})  ` +
    `lookups=${looked}/${words} (${(s.lookup_rate*100).toFixed(1)}%)  ` +
    `quiz=${s.quiz_score === null ? "-" : (s.quiz_score*100).toFixed(0)+"%"}  ` +
    `rating=${s.rating ?? "-"}  | ${piece ? piece.title : "?"}`
  );
}

console.log("\n=== pieces ===");
for (const p of db.prepare("SELECT id, title, level, model, report, created_at FROM pieces ORDER BY created_at DESC LIMIT 8").all()) {
  const r = JSON.parse(p.report);
  console.log(`  ${p.created_at.slice(5,19)} lvl=${p.level.toFixed(0).padStart(3)} ${r.totalWords}w ${(r.outOfBandRate*100).toFixed(1)}% oob  ${p.title}`);
}

console.log("\naudio:", JSON.stringify(db.prepare("SELECT COALESCE(SUM(characters),0) chars, COUNT(*) n FROM audio").get()));
console.log("gloss cache:", db.prepare("SELECT COUNT(*) n FROM gloss_cache").get().n, "entries");
'
