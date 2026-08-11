/**
 * What a reader has actually done, read back out of the data the app was
 * already keeping.
 *
 * Almost nothing here is new information. `sessions` has recorded
 * level_before, level_after, lookup_rate, quiz_score and a timestamp for every
 * completed reading since the app existed, and the only query ever run against
 * it was COUNT(*). `profiles.vocab_estimate` and `placed_at` - the placement
 * measurement, which is exactly the "when you started" half of the headline -
 * were written and never read either. So this works retroactively, for
 * everyone, without having recorded anything new.
 *
 * No network, no LLM, no clock: every function takes what it needs and returns
 * plain data. The page renders on the server on every request, so this has to
 * be cheap and it has to be the same twice.
 */
import { getDb } from "./db";
import { getProfile } from "./user";
import { levelForVocab } from "@/lib/level";
import { FIELDS, type Field } from "@/lib/suggestions";
import { FORMATS, type Format } from "@/lib/formats";
import { DAY_FINISHED, DAY_LOOKED, DAY_MADE, type DayWeight, type ReadingDay } from "@/lib/streaks";

export interface ProgressSummary {
  /**
   * Where the reader started and where they are, as LEVELS - never as a
   * number of words.
   *
   * The app used to publish "you can read about 2,269 words", which was the
   * count of entries in the top N of an OpenSubtitles frequency list. That
   * list holds word forms, not words: at least a third of the top 20,000
   * Spanish entries are a plural or a conjugation of a base form already in
   * the same list, and its tail is proper nouns and English. The number read
   * roughly three times higher than any honest reading of "words you know",
   * and the readers best placed to judge it were the ones who did not believe
   * it.
   *
   * The level survives because it is not a claim about the world: it is this
   * app's own dial, calibrated against how much a reader actually looks up.
   * The band it maps to - B2, HSK 4 - is what a reader recognises. Both are
   * kept; the count is gone.
   */
  thenLevel: number;
  nowLevel: number;
  /** Signed, in level points. A reader who has gone backwards is told so. */
  delta: number;
  /** Readings finished in this language. */
  sessions: number;
  /** True when the "then" is the placement rather than a guess from a reading. */
  fromPlacement: boolean;
}

export function progressSummary(userId: string, code: string): ProgressSummary | null {
  const profile = getProfile(userId, code);
  // getProfile deliberately falls back to ANY profile when the asked-for
  // language has none, so that a stale active_language does not read as "never
  // placed". Useful there, wrong here: it would pair Spanish's level with
  // German's empty history and call the result progress. No profile in this
  // language means no progress in it.
  if (!profile || profile.language !== code) return null;

  const row = getDb()
    .prepare(
      `SELECT COUNT(*)            AS sessions,
              MIN(s.level_before) AS earliest
         FROM sessions s
         JOIN pieces   p ON p.id = s.piece_id
        WHERE s.user_id = ? AND p.language = ?`,
    )
    .get(userId, code) as { sessions: number; earliest: number | null };

  const nowLevel = profile.level;

  // The placement is the honest starting point when we have it. Falling back
  // to the earliest level we ever recorded is second best and flagged as such,
  // because it is not where they started - it is the first time we looked.
  //
  // vocab_estimate is still what the placement wrote, so it is still converted
  // through levelForVocab to get a level. That conversion is internal: the
  // estimate is the test's own raw output, and the level is what anyone sees.
  const fromPlacement = profile.vocabEstimate !== null;
  const thenLevel = fromPlacement
    ? levelForVocab(profile.vocabEstimate!)
    : (row.earliest ?? nowLevel);

  return {
    thenLevel,
    nowLevel,
    // NOT clamped at zero. A reader whose level has come down is told so,
    // because the alternative is a progress page that lies on exactly the
    // days it matters.
    delta: nowLevel - thenLevel,
    sessions: row.sessions,
    fromPlacement,
  };
}

/**
 * How many pieces have been finished in this language.
 *
 * Its own query rather than progressSummary().sessions: the home page needs to
 * know only whether the /progress link has anything behind it, and running the
 * whole summary - profile lookup, MIN over the join, two vocabulary
 * conversions - to answer "more than zero?" would be work on every visit for a
 * number nobody displays.
 */
export function finishedReadings(userId: string, code: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n
         FROM sessions s
         JOIN pieces   p ON p.id = s.piece_id
        WHERE s.user_id = ? AND p.language = ?`,
    )
    .get(userId, code) as { n: number };
  return row.n;
}

export interface Reading {
  at: string;
  levelBefore: number;
  levelAfter: number;
  rating: string | null;
  quizScore: number | null;
  lookupRate: number;
  title: string;
  format: Format;
}

/**
 * Every finished reading, oldest first.
 *
 * Ascending, unlike every other list in this app. A chart read left to right
 * is the one place newest-first is wrong.
 */
export function levelSeries(userId: string, code: string): Reading[] {
  const rows = getDb()
    .prepare(
      `SELECT s.created_at, s.level_before, s.level_after, s.rating,
              s.quiz_score, s.lookup_rate, p.title, p.format
         FROM sessions s
         JOIN pieces   p ON p.id = s.piece_id
        WHERE s.user_id = ? AND p.language = ?
        ORDER BY s.created_at ASC`,
    )
    .all(userId, code) as {
    created_at: string;
    level_before: number;
    level_after: number;
    rating: string | null;
    quiz_score: number | null;
    lookup_rate: number;
    title: string;
    format: Format;
  }[];

  return rows.map((r) => ({
    at: r.created_at,
    levelBefore: r.level_before,
    levelAfter: r.level_after,
    rating: r.rating,
    quizScore: r.quiz_score,
    lookupRate: r.lookup_rate,
    title: r.title,
    format: r.format,
  }));
}

export type CellState = "filled" | "started" | "empty";

export interface BreadthCell {
  field: Field;
  format: Format;
  state: CellState;
  /** Finished readings in this cell. */
  count: number;
}

export interface Breadth {
  /** Always FIELDS x FORMATS, in that order, however little has been read. */
  cells: BreadthCell[];
  filled: number;
  total: number;
  /** Finished pieces the model could not place in any field. */
  otherCount: number;
  /** Finished pieces from before the app labelled fields at all. */
  unlabelledCount: number;
}

/**
 * The grid.
 *
 * A cell is filled by a FINISHED reading, not by a generated piece: the grid
 * claims "you have read about this", and generating is one click. Pieces that
 * were generated and never finished get their own state, which is the most
 * actionable thing on the page - it is the list of things you put down.
 */
export function breadth(userId: string, code: string): Breadth {
  const db = getDb();

  const finished = db
    .prepare(
      `SELECT p.topic_field AS field, p.format AS format, COUNT(*) AS n
         FROM sessions s
         JOIN pieces   p ON p.id = s.piece_id
        WHERE s.user_id = ? AND p.language = ?
        GROUP BY p.topic_field, p.format`,
    )
    .all(userId, code) as { field: string | null; format: Format; n: number }[];

  const started = db
    .prepare(
      `SELECT p.topic_field AS field, p.format AS format, COUNT(*) AS n
         FROM pieces p
         LEFT JOIN sessions s ON s.piece_id = p.id
        WHERE p.user_id = ? AND p.language = ? AND s.piece_id IS NULL
        GROUP BY p.topic_field, p.format`,
    )
    .all(userId, code) as { field: string | null; format: Format; n: number }[];

  const key = (f: string, fmt: string) => `${f}:${fmt}`;
  const finishedBy = new Map(finished.map((r) => [key(String(r.field), r.format), r.n]));
  const startedBy = new Map(started.map((r) => [key(String(r.field), r.format), r.n]));

  const cells: BreadthCell[] = [];
  for (const field of FIELDS) {
    for (const format of FORMATS) {
      const done = finishedBy.get(key(field, format)) ?? 0;
      const begun = startedBy.get(key(field, format)) ?? 0;
      cells.push({
        field,
        format,
        state: done > 0 ? "filled" : begun > 0 ? "started" : "empty",
        count: done,
      });
    }
  }

  // Two different facts, kept apart on purpose. "other" means the model looked
  // and none of the fields fitted. NULL means nobody looked, because the piece
  // predates the label. Merging them would throw away the distinction db.ts
  // calls deliberate.
  const sum = (rows: typeof finished, match: (f: string | null) => boolean) =>
    rows.filter((r) => match(r.field)).reduce((n, r) => n + r.n, 0);

  return {
    cells,
    filled: cells.filter((c) => c.state === "filled").length,
    total: cells.length,
    otherCount: sum(finished, (f) => f === "other"),
    unlabelledCount: sum(finished, (f) => f === null),
  };
}

/**
 * Days the reader turned up, from three signals at once.
 *
 * Not sessions alone. A session row needs TWO deliberate clicks - "I've
 * finished reading" and then "Save and update my level" - so reading a whole
 * piece and closing the tab records nothing at all. A calendar built on
 * sessions would tell someone who showed up daily for a fortnight that they
 * showed up four times, and a habit tracker that under-reports the habit is
 * worse than no habit tracker.
 *
 * Lookups are the honest presence signal: written per tap, in real time, and
 * impossible to produce without being on the page.
 *
 * `shift` is a SQLite date modifier, and the default is "+0 hours" rather than
 * the empty string. That is not fussiness: date(x, '') returns NULL, not x, so
 * an empty modifier silently buckets every event under a null day and the
 * calendar comes back blank with nothing thrown. "+0 hours" is a real modifier
 * that does nothing.
 *
 * Days are bucketed in UTC because created_at is an ISO string; wiring a
 * reader's own offset later is this one parameter, with no query to rewrite.
 */
export function readingDays(
  userId: string,
  code: string,
  sinceIso: string,
  shift = "+0 hours",
): ReadingDay[] {
  const rows = getDb()
    .prepare(
      `SELECT day,
              SUM(finished) AS finished,
              SUM(looked)   AS looked,
              SUM(made)     AS made
         FROM (
           SELECT date(s.created_at, ?) AS day, 1 AS finished, 0 AS looked, 0 AS made
             FROM sessions s JOIN pieces p ON p.id = s.piece_id
            WHERE s.user_id = ? AND p.language = ? AND s.created_at >= ?
           UNION ALL
           SELECT date(l.created_at, ?), 0, 1, 0
             FROM lookups l JOIN pieces p ON p.id = l.piece_id
            WHERE l.user_id = ? AND p.language = ? AND l.created_at >= ?
           UNION ALL
           SELECT date(p.created_at, ?), 0, 0, 1
             FROM pieces p
            WHERE p.user_id = ? AND p.language = ? AND p.created_at >= ?
         )
        GROUP BY day
        ORDER BY day`,
    )
    .all(
      shift, userId, code, sinceIso,
      shift, userId, code, sinceIso,
      shift, userId, code, sinceIso,
    ) as { day: string; finished: number; looked: number; made: number }[];

  return rows.map((r) => {
    const weight: DayWeight = r.finished > 0 ? DAY_FINISHED : r.looked > 0 ? DAY_LOOKED : DAY_MADE;
    return { day: r.day, weight, events: r.finished + r.looked + r.made };
  });
}
