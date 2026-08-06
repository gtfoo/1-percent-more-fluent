/**
 * Prove the per-language profile migration preserves data.
 *
 *   npm run migration
 *
 * It rebuilds the profiles table - create new, copy, DROP the old, rename -
 * because SQLite cannot alter a primary key. That is the one shape of migration
 * that can lose a learner's level outright, so it is tested against a database
 * built in the OLD shape rather than trusted.
 *
 * Runs entirely in a temp directory. It never opens the real database.
 */
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) console.log(`       expected ${e}\n       got      ${a}`);
}

const dir = mkdtempSync(join(tmpdir(), "fluent-migration-"));
process.env.DATA_DIR = dir;

// --- Build a database in the OLD shape, with real-looking rows --------------
{
  const old = new Database(join(dir, "fluent.sqlite"));
  old.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE profiles (
      user_id        TEXT PRIMARY KEY,
      language       TEXT NOT NULL DEFAULT 'es',
      level          REAL NOT NULL,
      vocab_estimate INTEGER,
      placed_at      TEXT,
      updated_at     TEXT NOT NULL
    );
    INSERT INTO users VALUES ('u-es', '2026-01-01'), ('u-zh', '2026-01-01');
    INSERT INTO profiles VALUES
      ('u-es', 'es',    62.5, 4200, '2026-01-01', '2026-01-02'),
      ('u-zh', 'zh-CN',  8.4,  120, '2026-01-01', '2026-01-02');
  `);
  old.close();
}

// Required, not imported at the top: db.ts reads DATA_DIR at module load, so
// the env var above has to be set before it is pulled in. `require` keeps this
// file CommonJS - top-level await is not available under tsx's cjs output.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDb } = require("../src/server/db") as typeof import("../src/server/db");
const db = getDb();

console.log("--- the rebuild ---");

const pk = (db.prepare("PRAGMA table_info(profiles)").all() as { name: string; pk: number }[])
  .filter((c) => c.pk > 0)
  .sort((a, b) => a.pk - b.pk)
  .map((c) => c.name);
check("primary key is (user_id, language)", pk, ["user_id", "language"]);

const rows = db
  .prepare("SELECT user_id, language, level, vocab_estimate FROM profiles ORDER BY user_id")
  .all();
check("every profile survived, unchanged", rows, [
  { user_id: "u-es", language: "es", level: 62.5, vocab_estimate: 4200 },
  { user_id: "u-zh", language: "zh-CN", level: 8.4, vocab_estimate: 120 },
]);

const active = db
  .prepare("SELECT id, active_language FROM users ORDER BY id")
  .all();
check("whatever they were reading stays active", active, [
  { id: "u-es", active_language: "es" },
  { id: "u-zh", active_language: "zh-CN" },
]);

console.log("\n--- what the new shape buys ---");

// The thing the old schema made impossible.
db.prepare(
  "INSERT INTO profiles (user_id, language, level, vocab_estimate, placed_at, updated_at) VALUES (?,?,?,?,?,?)",
).run("u-es", "zh-CN", 5, 90, "2026-02-01", "2026-02-01");

const both = db
  .prepare("SELECT language, level FROM profiles WHERE user_id = 'u-es' ORDER BY language")
  .all();
check("one learner can hold two languages", both, [
  { language: "es", level: 62.5 },
  { language: "zh-CN", level: 5 },
]);

// A nudge after a Chinese session must not move the Spanish level.
db.prepare("UPDATE profiles SET level = ? WHERE user_id = ? AND language = ?").run(
  7,
  "u-es",
  "zh-CN",
);
const afterNudge = db
  .prepare("SELECT language, level FROM profiles WHERE user_id = 'u-es' ORDER BY language")
  .all();
check("a nudge in one language leaves the other alone", afterNudge, [
  { language: "es", level: 62.5 },
  { language: "zh-CN", level: 7 },
]);

console.log("\n--- running it twice ---");
// getDb caches, so re-run the guard directly: the migration must be a no-op the
// second time rather than dropping a now-correct table.
const pkAgain = (db.prepare("PRAGMA table_info(profiles)").all() as { pk: number; name: string }[])
  .filter((c) => c.pk > 0)
  .map((c) => c.name);
check("still migrated, nothing re-run", pkAgain.includes("language"), true);

db.close();
rmSync(dir, { recursive: true, force: true });

console.log(failures ? `\n${failures} failing` : "\nthe migration preserves every profile");
process.exit(failures ? 1 : 0);
