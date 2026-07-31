import type { NextRequest } from "next/server";
import { getOrCreateUserId, getProfile, setLevel } from "@/server/user";
import { getPiece } from "@/server/generate";
import { countLookups } from "@/server/gloss";
import { getDb } from "@/server/db";
import { cefrFor, nextLevel, type SelfRating } from "@/lib/level";

const RATINGS: SelfRating[] = ["too-easy", "just-right", "too-hard"];

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
  const lookupRate = countLookups(userId, piece.id) / totalWords;

  const before = profile.level;
  const after = nextLevel(before, { lookupRate, quizScore, rating });
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
    levelBefore: before,
    levelAfter: after,
    cefrBefore: cefrFor(before),
    cefrAfter: cefrFor(after),
  });
}
