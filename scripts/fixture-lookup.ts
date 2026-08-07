/**
 * Put one lookup row in the local database, or take it out again.
 *
 *   npx tsx scripts/fixture-lookup.ts add zh-CN 钥匙 "key"
 *   npx tsx scripts/fixture-lookup.ts add zh-CN 钥匙          # no gloss
 *   npx tsx scripts/fixture-lookup.ts remove zh-CN 钥匙
 *
 * Exists so check-words-page.sh can assert against rows it created itself.
 * Asserting on whatever happens to be in the database does not survive contact
 * with a second machine - the first attempt keyed off a word belonging to a
 * different user and failed for reasons that had nothing to do with the page.
 *
 * A gloss is written to gloss_cache when a meaning is given, and `remove` takes
 * it out again. That cache is shared across all readers, so leaving test rows
 * in it would hand someone a fake definition.
 *
 * Prints the user id it attached to, which is what the caller needs for the
 * cookie.
 */
import { getDb } from "../src/server/db";

const [action, language, word, meaning] = process.argv.slice(2);
if (action !== "add" && action !== "remove") {
  console.error("usage: fixture-lookup.ts add|remove <language> <word> [meaning]");
  process.exit(2);
}
if (!language || !word) {
  console.error("language and word are required");
  process.exit(2);
}

const db = getDb();
const piece = db
  .prepare("SELECT id, user_id FROM pieces WHERE language = ? LIMIT 1")
  .get(language) as { id: string; user_id: string } | undefined;

if (!piece) {
  console.error(`no ${language} piece in this database`);
  process.exit(1);
}

if (action === "add") {
  db.prepare(
    "INSERT OR IGNORE INTO lookups (user_id, piece_id, word, created_at) VALUES (?, ?, ?, ?)",
  ).run(piece.user_id, piece.id, word, new Date().toISOString());
  if (meaning) {
    db.prepare(
      "INSERT OR REPLACE INTO gloss_cache (language, word, meaning, created_at) VALUES (?, ?, ?, ?)",
    ).run(language, word, JSON.stringify({ meaning }), new Date().toISOString());
  }
} else {
  db.prepare("DELETE FROM lookups WHERE user_id = ? AND piece_id = ? AND word = ?").run(
    piece.user_id,
    piece.id,
    word,
  );
  db.prepare("DELETE FROM gloss_cache WHERE language = ? AND word = ?").run(language, word);
}

console.log(piece.user_id);
