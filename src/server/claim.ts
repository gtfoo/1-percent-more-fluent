/**
 * Moving what you read anonymously onto the account you just signed into.
 *
 * This has no equivalent in the app this auth setup was copied from. There,
 * accounts arrived before any server-side data existed, so a new sign-in had
 * nothing to inherit. Here it is the opposite: every reader already has a
 * cookie identity carrying a level, a reading history and a word list, built up
 * over weeks. Signing in must not look like starting again.
 *
 * Two cases, one code path:
 *
 *   - First sign-in. Auth.js creates a row for the email; everything on the
 *     cookie moves to it and the anonymous row is deleted.
 *   - Second device. The email already has an account; the same move happens,
 *     and the two histories combine.
 *
 * The only real conflict is `profiles`, keyed (user_id, language) - a reader
 * can hold a level for Spanish on both sides. Pieces, lookups and sessions are
 * all keyed by a piece id that belongs to exactly one side, so they merely
 * change owner.
 */
import { getDb } from "./db";

export interface ClaimResult {
  claimed: boolean;
  pieces: number;
  lookups: number;
  profiles: number;
  /** Languages where both sides had a level and one had to be chosen. */
  contested: string[];
}

const NOTHING: ClaimResult = {
  claimed: false,
  pieces: 0,
  lookups: 0,
  profiles: 0,
  contested: [],
};

/**
 * Move everything belonging to `anonId` onto `accountId`, then delete the
 * anonymous user.
 *
 * Refuses when the source has an email of its own. Merging two real accounts
 * because someone happened to be carrying the other one's cookie would be
 * silent, unasked-for and unrecoverable - and it is the one mistake here that
 * destroys data belonging to somebody who is not even present.
 */
export function claimAnonymousData(anonId: string, accountId: string): ClaimResult {
  if (!anonId || !accountId || anonId === accountId) return NOTHING;

  const db = getDb();

  const source = db
    .prepare("SELECT id, email, active_language FROM users WHERE id = ?")
    .get(anonId) as { id: string; email: string | null; active_language: string | null } | undefined;
  if (!source || source.email) return NOTHING;

  const target = db.prepare("SELECT id FROM users WHERE id = ?").get(accountId);
  if (!target) return NOTHING;

  const run = db.transaction((): ClaimResult => {
    const contested: string[] = [];
    let profiles = 0;

    const anonProfiles = db
      .prepare("SELECT language, updated_at FROM profiles WHERE user_id = ?")
      .all(anonId) as { language: string; updated_at: string }[];

    for (const row of anonProfiles) {
      const mine = db
        .prepare("SELECT updated_at FROM profiles WHERE user_id = ? AND language = ?")
        .get(accountId, row.language) as { updated_at: string } | undefined;

      if (!mine) {
        db.prepare(
          "UPDATE profiles SET user_id = ? WHERE user_id = ? AND language = ?",
        ).run(accountId, anonId, row.language);
        profiles++;
        continue;
      }

      contested.push(row.language);
      // Newest wins. Not highest: a level is an estimate that moves in both
      // directions, and the high-water mark from a device abandoned months ago
      // would mispitch every generation from here on. The most recent reading
      // is the best evidence of what this person can read TODAY.
      if (row.updated_at > mine.updated_at) {
        db.prepare("DELETE FROM profiles WHERE user_id = ? AND language = ?").run(
          accountId,
          row.language,
        );
        db.prepare(
          "UPDATE profiles SET user_id = ? WHERE user_id = ? AND language = ?",
        ).run(accountId, anonId, row.language);
        profiles++;
      } else {
        db.prepare("DELETE FROM profiles WHERE user_id = ? AND language = ?").run(
          anonId,
          row.language,
        );
      }
    }

    // Everything else just changes owner. Each is keyed by a piece that belongs
    // to one side only, so there is nothing to collide with.
    const pieces = db
      .prepare("UPDATE pieces SET user_id = ? WHERE user_id = ?")
      .run(accountId, anonId).changes;
    const lookups = db
      .prepare("UPDATE lookups SET user_id = ? WHERE user_id = ?")
      .run(accountId, anonId).changes;
    db.prepare("UPDATE sessions SET user_id = ? WHERE user_id = ?").run(accountId, anonId);

    // Carry the language they were actually reading a moment ago, rather than
    // whatever the account was last left on.
    if (source.active_language) {
      db.prepare("UPDATE users SET active_language = ? WHERE id = ?").run(
        source.active_language,
        accountId,
      );
    }

    db.prepare("DELETE FROM users WHERE id = ?").run(anonId);

    return { claimed: true, pieces, lookups, profiles, contested };
  });

  return run();
}
