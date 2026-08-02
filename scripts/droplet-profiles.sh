#!/usr/bin/env bash
# Print the live profiles and recent pieces from the droplet.
#
#   bash scripts/droplet-profiles.sh
#
# There is no sqlite3 binary on the droplet, so this ships a small node script
# over and runs it against the standalone build's own better-sqlite3.
set -u
cd "$(dirname "$0")/.." || exit 1

read -r -d '' JS <<'EOF'
// Absolute: the script is written to /tmp, so relative resolution finds nothing.
const APP = "/home/deploy/1-percent-more-fluent";
const Database = require(APP + "/node_modules/better-sqlite3");
const db = new Database(APP + "/data/fluent.sqlite", { readonly: true });
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all()
  .map((r) => r.name);
console.log("tables:", tables.join(", "));

if (tables.includes("profiles")) {
  const cols = db.prepare("PRAGMA table_info(profiles)").all().map((c) => c.name);
  console.log("profiles columns:", cols.join(", "));
  console.log(JSON.stringify(db.prepare("SELECT * FROM profiles").all(), null, 1));
}
if (tables.includes("pieces")) {
  console.log(
    JSON.stringify(
      db
        .prepare(
          "SELECT language, format, topic, round(level,1) AS level, created_at FROM pieces ORDER BY created_at DESC LIMIT 8",
        )
        .all(),
      null,
      1,
    ),
  );
}
EOF

bash scripts/droplet.sh "cd /home/deploy/1-percent-more-fluent && cat > /tmp/p.js <<'JSEOF'
$JS
JSEOF
node /tmp/p.js"
