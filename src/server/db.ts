import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./paths";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  mkdirSync(DATA_DIR, { recursive: true });

  db = new Database(join(DATA_DIR, "fluent.sqlite"));
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );

    -- One row per learner. 'level' is the continuous 0-100 estimate that
    -- drives every generation; see src/lib/level.ts.
    CREATE TABLE IF NOT EXISTS profiles (
      user_id        TEXT PRIMARY KEY,
      language       TEXT NOT NULL DEFAULT 'es',
      level          REAL NOT NULL,
      vocab_estimate INTEGER,
      placed_at      TEXT,
      updated_at     TEXT NOT NULL
    );

    -- Generated pieces. Kept forever: they are the expensive artefact, they are
    -- re-readable, and once audio exists for one it must never be regenerated.
    CREATE TABLE IF NOT EXISTS pieces (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      language   TEXT NOT NULL,
      format     TEXT NOT NULL,   -- story | article | conversation
      topic      TEXT NOT NULL,
      level      REAL NOT NULL,   -- the level in force when it was generated
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,   -- JSON: string[] of paragraphs, or turns
      glossary   TEXT NOT NULL,   -- JSON: { word, meaning }[]
      questions  TEXT NOT NULL,   -- JSON: { question, options, answer }[]
      report     TEXT NOT NULL,   -- JSON: the measured DifficultyReport
      model      TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pieces_user ON pieces (user_id, created_at DESC);

    -- Every word the reader tapped. This is the honest difficulty signal, and
    -- later it is also the vocabulary feed for spaced repetition.
    CREATE TABLE IF NOT EXISTS lookups (
      user_id    TEXT NOT NULL,
      piece_id   TEXT NOT NULL,
      word       TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, piece_id, word)
    );

    -- Definitions are cached globally, not per user: the meaning of a Spanish
    -- word does not vary by who tapped it, and this keeps repeat taps free.
    CREATE TABLE IF NOT EXISTS gloss_cache (
      language   TEXT NOT NULL,
      word       TEXT NOT NULL,
      meaning    TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (language, word)
    );

    -- One row per completed reading, holding the signals that moved the level.
    CREATE TABLE IF NOT EXISTS sessions (
      piece_id     TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      rating       TEXT,
      quiz_score   REAL,
      lookup_rate  REAL NOT NULL,
      level_before REAL NOT NULL,
      level_after  REAL NOT NULL,
      created_at   TEXT NOT NULL
    );

    -- Synthesised audio, keyed by a hash of the exact text + voice + model.
    -- The file itself lives in public/audio/. This table exists so we can show
    -- the running character spend, which is the real cost of the product.
    CREATE TABLE IF NOT EXISTS audio (
      hash       TEXT PRIMARY KEY,
      piece_id   TEXT NOT NULL,
      voice_id   TEXT NOT NULL,
      model_id   TEXT NOT NULL,
      characters INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  addColumn("pieces", "speakers", "TEXT NOT NULL DEFAULT '[]'");
  // Pieces generated before topic terms existed simply have none, which reads
  // as "nothing protected" - exactly how they were measured at the time.
  addColumn("pieces", "terms", "TEXT NOT NULL DEFAULT '[]'");

  return db;
}

/**
 * Add a column to an existing table if it is not already there.
 *
 * The CREATE TABLE statements above are `IF NOT EXISTS`, so they do nothing
 * once a table exists - a new column has to be added explicitly or every
 * database created before this point keeps the old shape. Conversations
 * generated before speaker genders existed simply carry an empty list.
 */
function addColumn(table: string, column: string, definition: string): void {
  const columns = db!.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  if (columns.some((c) => c.name === column)) return;
  db!.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
