/**
 * Add pronunciation to pieces generated before it was computed.
 *
 *   npx tsx scripts/backfill-pronunciation.ts          # report only
 *   npx tsx scripts/backfill-pronunciation.ts --write  # actually write
 *
 * This is possible only because pronunciation is DERIVED. While it came from
 * the model, an old piece could never gain one without paying to regenerate it,
 * so "pinyin starts with your next piece" was a permanent scar on everything
 * already read. Computed from the characters, every existing term and glossary
 * entry can simply be filled in.
 *
 * Dry by default. It rewrites stored rows, and a bad run would be tedious to
 * undo, so the default is to show what it would do.
 */
import { getDb } from "../src/server/db";
import { derivesPronunciation, pronounce } from "../src/server/pronounce";

const write = process.argv.includes("--write");
// getDb rather than opening the file directly: it runs the migrations, and the
// `terms` column itself arrived in one of them.
const db = getDb();

interface Entry {
  meaning: string;
  pronunciation?: string;
  [k: string]: unknown;
}

let piecesTouched = 0;
let termsFilled = 0;
let glossFilled = 0;
let cacheFilled = 0;

// --- Pieces: terms and glossary ---------------------------------------------
const pieces = db
  .prepare("SELECT id, language, terms, glossary FROM pieces")
  .all() as { id: string; language: string; terms: string; glossary: string }[];

const updatePiece = db.prepare("UPDATE pieces SET terms = ?, glossary = ? WHERE id = ?");

for (const piece of pieces) {
  if (!derivesPronunciation(piece.language)) continue;

  const terms = JSON.parse(piece.terms || "[]") as (Entry & { term: string })[];
  const glossary = JSON.parse(piece.glossary || "[]") as (Entry & { word: string })[];

  let changed = 0;
  for (const t of terms) {
    if (t.pronunciation) continue;
    const said = pronounce(piece.language, t.term);
    if (said) {
      t.pronunciation = said;
      changed++;
      termsFilled++;
    }
  }
  for (const g of glossary) {
    if (g.pronunciation) continue;
    const said = pronounce(piece.language, g.word);
    if (said) {
      g.pronunciation = said;
      changed++;
      glossFilled++;
    }
  }

  if (!changed) continue;
  piecesTouched++;
  if (write) {
    updatePiece.run(JSON.stringify(terms), JSON.stringify(glossary), piece.id);
  }
}

// --- The gloss cache, which answers most taps -------------------------------
// Seeded entries and live lookups both land here, and the reader reads it
// rather than the piece, so leaving it alone would fix the data and not the UI.
const cached = db
  .prepare("SELECT language, word, meaning FROM gloss_cache")
  .all() as { language: string; word: string; meaning: string }[];

const updateCache = db.prepare(
  "UPDATE gloss_cache SET meaning = ? WHERE language = ? AND word = ?",
);

for (const row of cached) {
  if (!derivesPronunciation(row.language)) continue;

  let entry: Entry;
  try {
    entry = JSON.parse(row.meaning) as Entry;
  } catch {
    continue;
  }
  if (entry.pronunciation) continue;

  const said = pronounce(row.language, row.word);
  if (!said) continue;

  entry.pronunciation = said;
  cacheFilled++;
  if (write) updateCache.run(JSON.stringify(entry), row.language, row.word);
}

console.log(
  `${write ? "filled" : "would fill"}: ` +
    `${termsFilled} terms and ${glossFilled} glossary entries across ${piecesTouched} piece(s), ` +
    `plus ${cacheFilled} cached lookup(s)`,
);
if (!write) console.log("dry run - pass --write to apply");
db.close();
