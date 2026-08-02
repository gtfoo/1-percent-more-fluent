import type { NextRequest } from "next/server";
import { getOrCreateUserId, getProfile, setLevel } from "@/server/user";
import { getPiece } from "@/server/generate";
import { countLookups } from "@/server/gloss";
import { getDb } from "@/server/db";
import { labelFor, nextLevel, paramsFor, type SelfRating } from "@/lib/level";
import { getLanguage } from "@/lib/languages";
import { BUDGET_FLOOR, MIN_WORDS_FOR_FLOOR } from "@/server/difficulty";

const RATINGS: SelfRating[] = ["too-easy", "just-right", "too-hard"];

/**
 * Nobody reads faster than this, so less time on the page than the text needs
 * at this pace means it was not read. Used only as a fallback signal - an
 * answered quiz or a tapped word is better evidence and is checked first.
 */
const IMPLAUSIBLY_FAST_WPM = 300;

/**
 * Close out a reading session and re-calibrate.
 *
 * The lookup rate is taken from the server's own record of taps rather than
 * from anything the client reports - it is the one signal the reader is not
 * consciously producing, and so the one least likely to be flattering.
 */
export async function POST(req: NextRequest) {
  const userId = await getOrCreateUserId();
  const profile = getProfile(userId);
  if (!profile) {
    return Response.json({ error: "no profile" }, { status: 409 });
  }

  const body = (await req.json()) as {
    pieceId?: string;
    rating?: string;
    quizScore?: number;
    dwellMs?: number;
  };

  const piece = body.pieceId ? getPiece(body.pieceId) : null;
  if (!piece) return Response.json({ error: "unknown piece" }, { status: 404 });

  const rating = RATINGS.includes(body.rating as SelfRating)
    ? (body.rating as SelfRating)
    : undefined;
  const quizScore =
    typeof body.quizScore === "number" && body.quizScore >= 0 && body.quizScore <= 1
      ? body.quizScore
      : undefined;

  const totalWords = piece.report.totalWords || 1;
  const lookups = countLookups(userId, piece.id);
  const lookupRate = lookups / totalWords;

  // Did they actually read it? Zero lookups from someone who bounced off means
  // the opposite of zero lookups from someone who breezed through, and the
  // controller has to be able to tell them apart.
  const minimumPlausibleMs = (totalWords / IMPLAUSIBLY_FAST_WPM) * 60_000;
  const engaged =
    lookups > 0 ||
    quizScore !== undefined ||
    rating !== undefined ||
    (typeof body.dwellMs === "number" && body.dwellMs >= minimumPlausibleMs);

  const { count: sessionCount } = getDb()
    .prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?")
    .get(userId) as { count: number };

  // Did the piece actually reach the difficulty its own level called for? If
  // not, sailing through it says nothing about the reader, and the level must
  // not climb on the strength of it.
  const language = getLanguage(piece.language);
  const params = paramsFor(piece.level, language);
  const pieceUndershot =
    piece.report.totalWords >= MIN_WORDS_FOR_FLOOR &&
    piece.report.outOfBandRate < params.newWordBudget * BUDGET_FLOOR;

  const before = profile.level;
  const after = nextLevel(before, {
    lookupRate,
    quizScore,
    rating,
    engaged,
    sessionCount,
    pieceUndershot,
  });
  setLevel(userId, after);

  getDb()
    .prepare(
      `INSERT OR REPLACE INTO sessions
         (piece_id, user_id, rating, quiz_score, lookup_rate, level_before, level_after, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      piece.id,
      userId,
      rating ?? null,
      quizScore ?? null,
      lookupRate,
      before,
      after,
      new Date().toISOString(),
    );

  return Response.json({
    lookupRate,
    engaged,
    pieceUndershot,
    levelBefore: before,
    levelAfter: after,
    labelBefore: labelFor(before, language),
    labelAfter: labelFor(after, language),
  });
}
