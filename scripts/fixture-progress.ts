/**
 * Build - or tear down - a reader with a history, in the local database.
 *
 *   npx tsx scripts/fixture-progress.ts add     # prints the user id
 *   npx tsx scripts/fixture-progress.ts empty   # placed, but never finished one
 *   npx tsx scripts/fixture-progress.ts remove
 *
 * Exists so check-progress-page.sh can assert against rows it created itself.
 * Every row is owned by one fixed user id, so `remove` is exact and the script
 * never touches a real reader's data - the first version of the word-list check
 * asserted on somebody else's rows and failed on a second machine for reasons
 * that had nothing to do with the page.
 *
 * The history is deliberately awkward: a level that goes DOWN, a gap where the
 * reader moved the level by hand, one piece started and abandoned, one piece
 * the model could not label, and one it labelled `other`. Those are the cases
 * the page has to state honestly, so they are the cases the fixture contains.
 */
import { getDb } from "../src/server/db";

const USER = "zzfixture-progress-userzz";
const LANGUAGE = "es";
/** Fixed dates, so two runs produce the same page. */
const DAY = (n: number) =>
  new Date(Date.UTC(2026, 6, n, 9, 30, 0)).toISOString();

const db = getDb();
const action = process.argv[2];

function wipe(): void {
  for (const table of ["sessions", "lookups", "pieces", "profiles"]) {
    db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(USER);
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(USER);
}

if (action === "remove") {
  wipe();
  console.log(USER);
  process.exit(0);
}

if (action !== "add" && action !== "empty") {
  console.error("usage: fixture-progress.ts add|empty|remove");
  process.exit(2);
}

// Idempotent: rebuild from scratch rather than adding a second history on top.
wipe();

// getUserId refuses a cookie pointing at a user row that does not exist, so the
// fixture needs the row as well as the data hanging off it.
db.prepare(
  "INSERT INTO users (id, created_at, active_language) VALUES (?, ?, ?)",
).run(USER, DAY(1), LANGUAGE);

db.prepare(
  `INSERT INTO profiles (user_id, language, level, vocab_estimate, placed_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?)`,
).run(USER, LANGUAGE, 41, 1400, DAY(1), DAY(20));

// Placed, and nothing read. Not a hypothetical: it is everyone's first visit,
// and it is the state most likely to render a divide-by-zero or an empty chart
// with a stray axis floating in it.
if (action === "empty") {
  console.log(USER);
  process.exit(0);
}

const piece = db.prepare(
  `INSERT INTO pieces (id, user_id, language, format, topic, level, title, body,
                       glossary, questions, report, model, created_at, topic_field)
   VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]', '{}', 'fixture', ?, ?)`,
);
const session = db.prepare(
  `INSERT INTO sessions (id, piece_id, user_id, rating, quiz_score, lookup_rate,
                         level_before, level_after, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

interface Reading {
  format: string;
  field: string | null;
  day: number;
  before: number;
  after: number;
  rating: string | null;
  lookupRate: number;
}

const READINGS: Reading[] = [
  { format: "article", field: "food", day: 2, before: 32, after: 34, rating: null, lookupRate: 0.04 },
  { format: "story", field: "travel", day: 3, before: 34, after: 36, rating: null, lookupRate: 0.05 },
  // Down. The whole reason the level is shown honestly rather than ratcheted.
  { format: "article", field: "medicine", day: 5, before: 36, after: 33, rating: "too-hard", lookupRate: 0.19 },
  { format: "conversation", field: "food", day: 6, before: 33, after: 35, rating: null, lookupRate: 0.07 },
  // A gap: 35 out, 39 in. Nothing wrote a session between the two, because the
  // reader moved the level themselves. The chart must draw that dotted.
  { format: "article", field: "payments", day: 9, before: 39, after: 40, rating: null, lookupRate: 0.06 },
  { format: "story", field: "philosophy", day: 10, before: 40, after: 41, rating: null, lookupRate: 0.12 },
  // Finished twice. One cell, count 2 - and two dots, which is the entire
  // point of the sessions rebuild.
  { format: "story", field: "philosophy", day: 12, before: 41, after: 41, rating: null, lookupRate: 0.03 },
  { format: "article", field: "other", day: 13, before: 41, after: 41, rating: null, lookupRate: 0.05 },
  { format: "article", field: null, day: 14, before: 41, after: 41, rating: null, lookupRate: 0.05 },
];

READINGS.forEach((r, i) => {
  const id = `${USER}-piece-${i}`;
  piece.run(id, USER, LANGUAGE, r.format, `fixture topic ${i}`, r.before,
    `Fixture piece ${i}`, DAY(r.day), r.field);
  session.run(`${USER}-session-${i}`, id, USER, r.rating, 0.75, r.lookupRate,
    r.before, r.after, DAY(r.day));
  // One lookup on the same day, so the calendar has a day that is a lookup and
  // not only a finish.
  db.prepare(
    "INSERT OR IGNORE INTO lookups (user_id, piece_id, word, created_at) VALUES (?, ?, ?, ?)",
  ).run(USER, id, `zzfixtureword${i}zz`, DAY(r.day));
});

// Generated and never finished: the dashed cell, and a day on the calendar
// that shows up as "you turned up" without a session.
piece.run(`${USER}-piece-abandoned`, USER, LANGUAGE, "conversation", "abandoned", 41,
  "Fixture abandoned", DAY(16), "sport");

// A lookup at 17:00 UTC, which is the 20th in Singapore and the 19th in
// Greenwich. Nothing else happens on either day, so which square it lands on is
// a direct readout of whose midnight the calendar is using.
db.prepare(
  "INSERT OR IGNORE INTO lookups (user_id, piece_id, word, created_at) VALUES (?, ?, ?, ?)",
).run(
  USER,
  `${USER}-piece-0`,
  "zzfixtureboundaryzz",
  new Date(Date.UTC(2026, 6, 19, 17, 0, 0)).toISOString(),
);

console.log(USER);
