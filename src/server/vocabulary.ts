/**
 * The words this reader needed help with.
 *
 * Every tap has been recorded since the app existed - `lookups` in db.ts even
 * says "later it is also the vocabulary feed for spaced repetition" - but until
 * now only `COUNT(*)` ever read it, to derive a lookup rate for the level. The
 * words themselves went nowhere, which is a waste: a word you had to tap is,
 * almost by definition, one you half-know, and that is the most valuable set in
 * the app.
 *
 * The meaning is not stored on the lookup. It is joined back from `gloss_cache`,
 * which was already paid for when the word was first tapped, so building this
 * list costs nothing and calls nothing.
 */
import { getDb } from "./db";

export interface VocabularyEntry {
  word: string;
  /** From the gloss cache. Null if the tap was recorded but the lookup failed. */
  meaning: string | null;
  pronunciation?: string;
  /**
   * How many DIFFERENT pieces you needed it in. The lookups primary key is
   * (user, piece, word), so tapping the same word twice in one text counts once
   * and tapping it across three texts counts three times - which is the signal
   * worth having. A word that keeps coming back is one to actually learn.
   */
  pieces: number;
  lastSeen: string;
}

interface Row {
  word: string;
  pieces: number;
  last_seen: string;
  gloss: string | null;
}

/** Newest first. A word met in several pieces carries its count. */
export function listVocabulary(userId: string, code: string): VocabularyEntry[] {
  const rows = getDb()
    .prepare(
      // Joined through pieces because `lookups` has no language column - the
      // piece it was tapped in is what says which language it belongs to.
      `SELECT l.word            AS word,
              COUNT(*)          AS pieces,
              MAX(l.created_at) AS last_seen,
              g.meaning         AS gloss
         FROM lookups l
         JOIN pieces p ON p.id = l.piece_id
         -- LEFT so a tap whose lookup failed still shows up. Dropping it would
         -- quietly hide a word the reader definitely struggled with.
         LEFT JOIN gloss_cache g
                ON g.language = p.language AND g.word = l.word
        WHERE l.user_id = ? AND p.language = ?
        GROUP BY l.word
        ORDER BY last_seen DESC`,
    )
    .all(userId, code) as Row[];

  return rows.map((row) => {
    const gloss = row.gloss
      ? (JSON.parse(row.gloss) as { meaning?: string; pronunciation?: string })
      : null;
    return {
      word: row.word,
      meaning: gloss?.meaning ?? null,
      ...(gloss?.pronunciation ? { pronunciation: gloss.pronunciation } : {}),
      pieces: row.pieces,
      lastSeen: row.last_seen,
    };
  });
}

/**
 * Just how many, for the home page.
 *
 * A separate COUNT rather than `listVocabulary(...).length`: the home page only
 * needs the number, and the full query parses a JSON blob per row.
 */
export function countVocabulary(userId: string, code: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(DISTINCT l.word) AS n
         FROM lookups l
         JOIN pieces p ON p.id = l.piece_id
        WHERE l.user_id = ? AND p.language = ?`,
    )
    .get(userId, code) as { n: number };
  return row.n;
}

/**
 * Drop a word from the list.
 *
 * Needed because the list is not curated - it is whatever got tapped. Real
 * production data has entries like 的屏蔽效, where a selection swept across a
 * grammatical particle and stopped mid-word. Guessing which entries are junk is
 * not something to do on the reader's behalf, so they can just remove them.
 *
 * This deletes the difficulty signal along with the entry. That is the right
 * trade: a word removed as noise should not have been counted as a struggle
 * either, and levels are recalculated per session rather than accumulated.
 */
export function forgetWord(userId: string, code: string, word: string): void {
  getDb()
    .prepare(
      `DELETE FROM lookups
        WHERE user_id = ?
          AND word = ?
          AND piece_id IN (SELECT id FROM pieces WHERE language = ?)`,
    )
    // The word exactly as stored. It came from listVocabulary, so normalising
    // it again here could only mangle a phrase into something that matches
    // nothing - and the delete is already scoped to this user and language.
    .run(userId, word, code);
}

/**
 * The words worth weaving into the reader's NEXT piece.
 *
 * A word you tapped is one you half-know, and meeting it again inside a new
 * text is what moves it from half-known to known - spaced repetition wearing
 * the clothes of ordinary reading. This is the query `db.ts` promised when it
 * called `lookups` "the vocabulary feed for spaced repetition".
 *
 * The ranking is the pedagogy:
 *
 *  - Words needed in SEVERAL pieces come first. A word that keeps being tapped
 *    is one the reader is circling without landing.
 *  - Among those, least-recently-seen first, because the word furthest from
 *    memory is the one a re-encounter helps most.
 *  - Nothing tapped in the last 30 minutes. Re-meeting a word five minutes
 *    after tapping it is not a re-encounter, it is the same encounter - and it
 *    would make every piece echo the one just read.
 *
 * Capped small deliberately. Six words woven into ~350 is seasoning; twenty
 * would bend the whole text around the reader's history and fight the topic.
 */
export function wordsToRecycle(userId: string, code: string, limit = 6): string[] {
  const rows = getDb()
    .prepare(
      `SELECT l.word AS word
         FROM lookups l
         JOIN pieces p ON p.id = l.piece_id
        WHERE l.user_id = ? AND p.language = ?
          -- Selections can sweep in junk (a phrase cut mid-word); a hard cap on
          -- length keeps a runaway selection out of a prompt. Real words and
          -- deliberate phrases fit comfortably.
          AND length(l.word) <= 24
        GROUP BY l.word
       HAVING MAX(l.created_at) < ?
        ORDER BY COUNT(DISTINCT l.piece_id) DESC, MAX(l.created_at) ASC
        LIMIT ?`,
    )
    .all(userId, code, new Date(Date.now() - 30 * 60_000).toISOString(), limit) as {
    word: string;
  }[];
  return rows.map((r) => r.word);
}

/**
 * Tab-separated, for import into Anki or anything else.
 *
 * Always three columns - word, reading, meaning - even for a language with no
 * reading, so the shape does not change under the importer depending on which
 * language produced the file. No header row: Anki maps fields by position and
 * would otherwise import the header as a card.
 */
export function toTsv(entries: VocabularyEntry[]): string {
  // A tab or newline inside a field would silently shift every later column.
  const clean = (value: string) => value.replace(/[\t\r\n]+/g, " ").trim();
  return entries
    .map((e) =>
      [clean(e.word), clean(e.pronunciation ?? ""), clean(e.meaning ?? "")].join("\t"),
    )
    .join("\n");
}
