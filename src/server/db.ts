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

    -- One row per learner PER LANGUAGE. 'level' is the continuous 0-100
    -- estimate that drives every generation; see src/lib/level.ts. Learning two
    -- languages means two independent levels, which is the only honest model:
    -- being B2 in Spanish says nothing about your Chinese.
    CREATE TABLE IF NOT EXISTS profiles (
      user_id        TEXT NOT NULL,
      language       TEXT NOT NULL,
      level          REAL NOT NULL,
      vocab_estimate INTEGER,
      placed_at      TEXT,
      updated_at     TEXT NOT NULL,
      PRIMARY KEY (user_id, language)
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

    -- One row per completed READING, holding the signals that moved the level.
    --
    -- Keyed on a surrogate id rather than piece_id, so re-reading a piece adds
    -- a row instead of overwriting the first one. See
    -- migrateSessionsToOneRowPerReading for what that used to cost.
    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT PRIMARY KEY,
      piece_id     TEXT NOT NULL,
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

    -- How much each address and each reader has spent against the paid routes
    -- in the current window. See src/server/limits.ts.
    --
    -- window_at is an INTEGER of epoch seconds, not the ISO string every other
    -- table here uses. Deliberate: this column is compared and swept
    -- arithmetically rather than read by a person, and a fixed window is
    -- computed by dividing.
    CREATE TABLE IF NOT EXISTS rate_limits (
      bucket    TEXT NOT NULL,
      window_at INTEGER NOT NULL,
      count     INTEGER NOT NULL,
      PRIMARY KEY (bucket, window_at)
    );
    CREATE INDEX IF NOT EXISTS rate_limits_sweep ON rate_limits (window_at);
  `);

  addColumn("pieces", "speakers", "TEXT NOT NULL DEFAULT '[]'");
  // Pieces generated before topic terms existed simply have none, which reads
  // as "nothing protected" - exactly how they were measured at the time.
  addColumn("pieces", "terms", "TEXT NOT NULL DEFAULT '[]'");

  // The domain the TOPIC sits in, labelled by the model that was already
  // reading it, and used only to order the starting-point chips.
  //
  // Nullable with no default, unlike speakers and terms above, because here
  // NULL carries meaning: a piece written before the label existed does not
  // vote on what to suggest next, which is different from voting "other".
  addColumn("pieces", "topic_field", "TEXT");

  // Looked-up words this piece deliberately wove back in - the true half only:
  // requested words the model did not use are not stored, so the "brings back
  // words you looked up" note can never name a word that is not in the text.
  addColumn("pieces", "recycled", "TEXT NOT NULL DEFAULT '[]'");

  // The piece this one was prefetched FROM, while its reader was still on it.
  // NULL for everything reader-requested; the value is what makes "is there
  // already a next piece for this one?" a lookup instead of a guess.
  addColumn("pieces", "parent_id", "TEXT");

  // Which language the learner is currently reading. Null until they place.
  addColumn("users", "active_language", "TEXT");

  addAccounts();
  migrateProfilesToPerLanguage();
  migrateSessionsToOneRowPerReading();

  // Neither table had any index but its own key, and every progress query
  // filters on the reader and orders by date. Cheap, and IF NOT EXISTS so
  // there is nothing to migrate.
  db.exec(`
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id, created_at);
    CREATE INDEX IF NOT EXISTS lookups_user  ON lookups  (user_id, created_at);
  `);

  return db;
}

/**
 * One row per READING, not one per piece.
 *
 * `sessions` was keyed on piece_id, and the write was INSERT OR REPLACE. So
 * re-reading a piece did not merely fail to record the second reading - it
 * DESTROYED the first. Finish something in June, read it again in August, and
 * the June row is gone: replaced by an August row carrying August's levels.
 *
 * That is worse than losing data, because the surviving row is wrong rather
 * than absent. The June point vanishes from the level history, the June day
 * vanishes from the reading calendar, and the August level move is attributed
 * to a piece that was finished twice.
 *
 * Re-reading is a first-class path - the home page links every piece ever
 * generated, and audio is never regenerated so it costs nothing - which makes
 * this a live loss, not a theoretical one. Every week of delay destroys rows
 * that cannot be recovered.
 *
 * SQLite cannot alter a primary key, so this is the same rebuild as
 * migrateProfilesToPerLanguage above. Existing rows reuse their piece_id as
 * the new surrogate id: it was the primary key, so it is unique by
 * construction, and it keeps the copy a plain INSERT ... SELECT with no
 * identifiers generated in SQL.
 */
function migrateSessionsToOneRowPerReading(): void {
  const columns = db!.prepare("PRAGMA table_info(sessions)").all() as {
    name: string;
    pk: number;
  }[];

  // Already migrated: the surrogate id is the key.
  if (columns.some((c) => c.name === "id" && c.pk > 0)) return;

  db!.exec(`
    BEGIN;
    CREATE TABLE sessions_new (
      id           TEXT PRIMARY KEY,
      piece_id     TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      rating       TEXT,
      quiz_score   REAL,
      lookup_rate  REAL NOT NULL,
      level_before REAL NOT NULL,
      level_after  REAL NOT NULL,
      created_at   TEXT NOT NULL
    );
    INSERT INTO sessions_new (id, piece_id, user_id, rating, quiz_score,
                              lookup_rate, level_before, level_after, created_at)
      SELECT piece_id, piece_id, user_id, rating, quiz_score,
             lookup_rate, level_before, level_after, created_at FROM sessions;
    DROP TABLE sessions;
    ALTER TABLE sessions_new RENAME TO sessions;
    COMMIT;
  `);
}

/**
 * Let a learner attach an email address to the browser they already read in.
 *
 * Accounts are OPTIONAL. Reading anonymously on a cookie is still the whole
 * product; signing in exists so progress can follow you to a second device.
 * So this extends the users table the app already has rather than introducing
 * a parallel one - the cookie id simply becomes the account id, and not one
 * existing profile, piece or lookup has to be re-keyed.
 *
 * SQLite cannot ADD COLUMN ... UNIQUE, so the email uniqueness that Auth.js
 * relies on is a separate index. It has to be a partial index: every existing
 * row has a NULL email, and while SQLite treats NULLs as distinct for
 * uniqueness, being explicit about it is cheaper than remembering that rule.
 */
function addAccounts(): void {
  addColumn("users", "email", "TEXT");
  addColumn("users", "email_verified", "TEXT");
  addColumn("users", "name", "TEXT");
  addColumn("users", "image", "TEXT");
  // Compared against the JWT on every request. Bumping it invalidates every
  // token already issued, which is how "sign out everywhere" works without
  // storing sessions server-side.
  addColumn("users", "token_version", "INTEGER NOT NULL DEFAULT 0");

  db!.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_by_email
      ON users(email) WHERE email IS NOT NULL;

    -- OAuth identities. Empty today - only the email provider is wired - but
    -- the adapter interface requires the methods, and a table that exists is
    -- cheaper than a migration later.
    CREATE TABLE IF NOT EXISTS accounts (
      user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider            TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      type                TEXT NOT NULL,
      PRIMARY KEY (provider, provider_account_id)
    );

    -- Magic-link tokens. Single use, short lived, deleted as they are read.
    CREATE TABLE IF NOT EXISTS verification_tokens (
      identifier TEXT NOT NULL,
      token      TEXT NOT NULL,
      expires    TEXT NOT NULL,
      PRIMARY KEY (identifier, token)
    );

    -- Passkeys. One row per credential, and a reader may hold several - a
    -- laptop and a phone are different credentials even when they sync.
    --
    -- Only PUBLIC keys are here. The private half never leaves the
    -- authenticator, which is the entire point: this table being read gives an
    -- attacker nothing to sign in with.
    CREATE TABLE IF NOT EXISTS authenticators (
      credential_id          TEXT PRIMARY KEY,
      user_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_account_id    TEXT NOT NULL,
      credential_public_key  TEXT NOT NULL,
      -- Bumped by the authenticator on each use. A counter that goes backwards
      -- means the credential was cloned; Auth.js checks it, we store it.
      counter                INTEGER NOT NULL,
      credential_device_type TEXT NOT NULL,
      credential_backed_up   INTEGER NOT NULL,
      transports             TEXT,
      created_at             TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS authenticators_by_user ON authenticators(user_id);
  `);
}

/**
 * Give every learner one profile PER LANGUAGE, instead of one profile.
 *
 * `profiles` was keyed on user_id alone, so a learner could only ever hold one
 * language: switching from Spanish to Chinese overwrote the row, and a level
 * built over weeks of reading was gone. That made switching something you could
 * only do once, which is why there was no button for it.
 *
 * SQLite cannot alter a primary key, so this is the standard rebuild: create
 * the new shape, copy every row across, swap the names. Existing rows carry
 * their own language, so each learner keeps exactly what they had - it simply
 * becomes the first of several rather than the only one.
 */
function migrateProfilesToPerLanguage(): void {
  const columns = db!.prepare("PRAGMA table_info(profiles)").all() as {
    name: string;
    pk: number;
  }[];

  // Already migrated: both columns are part of the key.
  const keyed = columns.filter((c) => c.pk > 0).map((c) => c.name);
  if (keyed.includes("language")) return;

  db!.exec(`
    BEGIN;
    CREATE TABLE profiles_new (
      user_id        TEXT NOT NULL,
      language       TEXT NOT NULL,
      level          REAL NOT NULL,
      vocab_estimate INTEGER,
      placed_at      TEXT,
      updated_at     TEXT NOT NULL,
      PRIMARY KEY (user_id, language)
    );
    INSERT INTO profiles_new (user_id, language, level, vocab_estimate, placed_at, updated_at)
      SELECT user_id, language, level, vocab_estimate, placed_at, updated_at FROM profiles;

    -- Whatever they were reading stays what they are reading.
    UPDATE users
       SET active_language = (SELECT language FROM profiles WHERE profiles.user_id = users.id)
     WHERE active_language IS NULL;

    DROP TABLE profiles;
    ALTER TABLE profiles_new RENAME TO profiles;
    COMMIT;
  `);
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
