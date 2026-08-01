import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { levelForVocab } from "@/lib/level";

const COOKIE = "fluent_uid";
/**
 * The app was called "Comprensible" before. Renaming the cookie outright would
 * orphan every existing profile and its whole reading history, so the old name
 * is still read and silently adopted. Safe to delete once nobody is carrying
 * one - it has no effect on new users.
 */
const LEGACY_COOKIE = "comprensible_uid";
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
 * Resolve the anonymous learner for this browser, creating one on first visit.
 * No login: progress rides on the cookie. Everything is keyed by user_id, so
 * attaching real accounts later is a migration, not a rewrite.
 */
export async function getOrCreateUserId(): Promise<string> {
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
  const jar = await cookies();
  const id = readUserCookie(jar);
  if (!id) return null;
  const known = getDb().prepare("SELECT 1 FROM users WHERE id = ?").get(id);
  return known ? id : null;
}

export function getProfile(userId: string): Profile | null {
  const row = getDb()
    .prepare(
      "SELECT user_id, language, level, vocab_estimate, placed_at FROM profiles WHERE user_id = ?",
    )
    .get(userId) as
    | {
        user_id: string;
        language: string;
        level: number;
        vocab_estimate: number | null;
        placed_at: string | null;
      }
    | undefined;

  if (!row) return null;
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
  language = "es",
  level = levelForVocab(vocabEstimate),
): Profile {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO profiles (user_id, language, level, vocab_estimate, placed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         language = excluded.language,
         level = excluded.level,
         vocab_estimate = excluded.vocab_estimate,
         placed_at = excluded.placed_at,
         updated_at = excluded.updated_at`,
    )
    .run(userId, language, level, vocabEstimate, now, now);

  return { userId, language, level, vocabEstimate, placedAt: now };
}

/** Apply a calibration nudge after a reading session. */
export function setLevel(userId: string, level: number): void {
  getDb()
    .prepare(
      "UPDATE profiles SET level = ?, updated_at = ? WHERE user_id = ?",
    )
    .run(level, new Date().toISOString(), userId);
}
