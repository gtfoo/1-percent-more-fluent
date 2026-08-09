import { UI_COOKIE, parseUiPreference, type UiPreference } from "@/lib/ui";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { levelForVocab } from "@/lib/level";
import { USER_COOKIE, LEGACY_USER_COOKIE } from "@/lib/cookies";
import { currentUser } from "@/auth";

const COOKIE = USER_COOKIE;
const LEGACY_COOKIE = LEGACY_USER_COOKIE;
const ONE_YEAR = 60 * 60 * 24 * 365;

type Jar = Awaited<ReturnType<typeof cookies>>;

function readUserCookie(jar: Jar): string | undefined {
  return jar.get(COOKIE)?.value ?? jar.get(LEGACY_COOKIE)?.value;
}

export interface Profile {
  userId: string;
  language: string;
  level: number;
  vocabEstimate: number | null;
  placedAt: string | null;
}

/**
 * Resolve the learner for this request, creating one on first visit.
 *
 * A session wins over the cookie. That ordering is what makes signing out mean
 * anything: the cookie is still sitting in the browser afterwards, so reading
 * it first would leave someone "signed out" and still looking at their own
 * history. It also makes signing in on a second device work without touching
 * that device's cookie at all.
 *
 * Below the session, nothing has changed - progress rides on the cookie, and an
 * account is optional.
 */
export async function getOrCreateUserId(): Promise<string> {
  const signedIn = await currentUser();
  if (signedIn) return signedIn.id;

  const jar = await cookies();
  const db = getDb();

  const existing = readUserCookie(jar);
  if (existing && db.prepare("SELECT 1 FROM users WHERE id = ?").get(existing)) {
    // Re-issue under the current name so a legacy cookie migrates on first use.
    jar.set(COOKIE, existing, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: ONE_YEAR,
    });
    return existing;
  }

  const id = randomUUID();
  db.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").run(
    id,
    new Date().toISOString(),
  );
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return id;
}

/**
 * Read-only lookup for pages. Cookies can only be *written* in a Server Action
 * or Route Handler, so a page render must not call getOrCreateUserId - it reads
 * whatever is already there and treats "nothing" as a first-time visitor. The
 * user row gets created by the first API call they make.
 */
export async function getUserId(): Promise<string | null> {
  const signedIn = await currentUser();
  if (signedIn) return signedIn.id;

  const jar = await cookies();
  const id = readUserCookie(jar);
  if (!id) return null;
  const known = getDb().prepare("SELECT 1 FROM users WHERE id = ?").get(id);
  // A cookie pointing at a row that no longer exists reads as a first-time
  // visitor. That is exactly what happens after signing in and out again: the
  // anonymous row was claimed and deleted, and the stale cookie should not
  // resurrect anything.
  return known ? id : null;
}

/**
 * Which language the learner wants the INTERFACE in, if they have said.
 *
 * A cookie rather than a profile column: it is a display preference, it should
 * survive being set before any profile exists, and it needs no migration.
 */
export async function getUiPreference(): Promise<UiPreference> {
  const jar = await cookies();
  return parseUiPreference(jar.get(UI_COOKIE)?.value);
}

/** Every language this learner has placed in, most recently used first. */
export function getProfiles(userId: string): Profile[] {
  const rows = getDb()
    .prepare(
      "SELECT user_id, language, level, vocab_estimate, placed_at FROM profiles WHERE user_id = ? ORDER BY updated_at DESC",
    )
    .all(userId) as {
    user_id: string;
    language: string;
    level: number;
    vocab_estimate: number | null;
    placed_at: string | null;
  }[];

  return rows.map((row) => ({
    userId: row.user_id,
    language: row.language,
    level: row.level,
    vocabEstimate: row.vocab_estimate,
    placedAt: row.placed_at,
  }));
}

/** The learner's currently selected language, or null if they have not placed. */
export function getActiveLanguage(userId: string): string | null {
  const row = getDb()
    .prepare("SELECT active_language FROM users WHERE id = ?")
    .get(userId) as { active_language: string | null } | undefined;
  return row?.active_language ?? null;
}

/**
 * Switch which language the learner is reading.
 *
 * Only ever points at a language they have already placed in - the level is
 * per-language now, so pointing at an unplaced one would leave them with no
 * level at all rather than with a default.
 */
export function setActiveLanguage(userId: string, language: string): boolean {
  const placed = getDb()
    .prepare("SELECT 1 FROM profiles WHERE user_id = ? AND language = ?")
    .get(userId, language);
  if (!placed) return false;

  getDb()
    .prepare("UPDATE users SET active_language = ? WHERE id = ?")
    .run(language, userId);
  return true;
}

/**
 * The profile in force: the named language, or whichever one is active.
 *
 * Falls back to the most recently updated profile when nothing is marked
 * active, which covers a learner whose row predates the active_language column
 * and never explicitly chose.
 */
export function getProfile(userId: string, language?: string): Profile | null {
  const wanted = language ?? getActiveLanguage(userId);
  if (!wanted) return getProfiles(userId)[0] ?? null;

  const row = getDb()
    .prepare(
      "SELECT user_id, language, level, vocab_estimate, placed_at FROM profiles WHERE user_id = ? AND language = ?",
    )
    .get(userId, wanted) as
    | {
        user_id: string;
        language: string;
        level: number;
        vocab_estimate: number | null;
        placed_at: string | null;
      }
    | undefined;

  // An active language pointing at a profile that is gone should not read as
  // "never placed" while other languages still exist.
  if (!row) return getProfiles(userId)[0] ?? null;
  return {
    userId: row.user_id,
    language: row.language,
    level: row.level,
    vocabEstimate: row.vocab_estimate,
    placedAt: row.placed_at,
  };
}

/**
 * Record a placement-test result, which both creates and resets a profile.
 *
 * `level` may be supplied to override what the vocabulary estimate alone would
 * imply - the read-back check blends the two, because a learner looking at real
 * graded text is better evidence than a word list, but not so much better that
 * the objective measure should be thrown away.
 */
export function setPlacement(
  userId: string,
  vocabEstimate: number,
  // Required, no default. It used to default to "es", which is the same trap
  // paramsFor already closed: a caller that forgets gets a confidently wrong
  // answer instead of a compile error, and with a third language the odds of
  // that being wrong went up rather than down.
  language: string,
  level = levelForVocab(vocabEstimate),
): Profile {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      // Conflict is on the PAIR now: re-placing in Spanish resets Spanish and
      // leaves Chinese untouched, where before it overwrote the single row and
      // the other language simply ceased to exist.
      `INSERT INTO profiles (user_id, language, level, vocab_estimate, placed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, language) DO UPDATE SET
         level = excluded.level,
         vocab_estimate = excluded.vocab_estimate,
         placed_at = excluded.placed_at,
         updated_at = excluded.updated_at`,
    )
    .run(userId, language, level, vocabEstimate, now, now);

  return { userId, language, level, vocabEstimate, placedAt: now };
}

/**
 * Apply a calibration nudge after a reading session.
 *
 * `language` is required. Scoped to one profile because there are several now:
 * without the clause this updated every row for the user, so finishing a
 * Chinese piece silently moved their Spanish level by the same amount. Pass the
 * language of the PIECE that was read, not the active one - they can differ if
 * the reader switched languages before finishing something.
 */
export function setLevel(userId: string, level: number, language: string): void {
  getDb()
    .prepare(
      "UPDATE profiles SET level = ?, updated_at = ? WHERE user_id = ? AND language = ?",
    )
    .run(level, new Date().toISOString(), userId, language);
}
