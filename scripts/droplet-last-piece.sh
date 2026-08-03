#!/usr/bin/env bash
# What did the droplet last generate, and which model served it?
#
#   bash scripts/droplet-last-piece.sh
set -u
cd "$(dirname "$0")/.." || exit 1

read -r -d '' JS <<'EOF'
const APP = "/home/deploy/1-percent-more-fluent";
const Database = require(APP + "/node_modules/better-sqlite3");
const db = new Database(APP + "/data/fluent.sqlite", { readonly: true });
const r = db
  .prepare(
    "SELECT id, language, format, topic, round(level,1) level, model, title, body, terms, report FROM pieces ORDER BY created_at DESC LIMIT 1",
  )
  .get();
if (!r) { console.log("no pieces"); process.exit(0); }
const report = JSON.parse(r.report);
console.log(`${r.id}`);
console.log(`  language ${r.language}  format ${r.format}  level ${r.level}`);
console.log(`  model    ${r.model}`);
console.log(`  title    ${r.title}`);
console.log(`  terms    ${JSON.parse(r.terms || "[]").map((t) => t.term).join(", ") || "(none)"}`);
console.log(
  `  measured ${report.totalWords} words, ${(report.outOfBandRate * 100).toFixed(1)}% out-of-band, terms ${((report.termRate || 0) * 100).toFixed(0)}%, passes=${report.passes}`,
);
console.log(`  first    ${JSON.parse(r.body)[0]}`);
EOF

bash scripts/droplet.sh "cat > /tmp/last.js <<'JSEOF'
$JS
JSEOF
node /tmp/last.js"
