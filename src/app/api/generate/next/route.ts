import type { NextRequest } from "next/server";
import { getUserId, getProfile } from "@/server/user";
import {
  existingFollowOn,
  followOnTopic,
  generatePiece,
  getPiece,
  lengthLike,
  unreadFollowOn,
} from "@/server/generate";
import { isLlmConfigured } from "@/server/llm";
import { getLanguage } from "@/lib/languages";
import type { Format } from "@/lib/formats";
import { getDb } from "@/server/db";
import { clientIp, PLANS, spendIp, spendUser, tooMany } from "@/server/limits";

const TOO_MANY = "That is a lot of writing for one day. Try again a bit later.";

/**
 * Write the reader's NEXT piece while they are still on the current one.
 *
 * Fired by the reader the moment a session is saved, so the ~20s of generation
 * happens behind the quiz-review panel instead of in front of a spinner. Done
 * well, the wait for the next piece is zero - which no amount of making
 * generation faster ever reaches.
 *
 * The topic costs nothing: the finished piece already carries 6-12 key terms,
 * and the follow-on is derived from them without a model call. The GENERATION
 * costs what any generation costs - which is why this route spends through the
 * same PLANS.generate ceilings as its siblings. A prefetch is not a discount,
 * it is the same purchase made earlier.
 */
export async function POST(req: NextRequest) {
  if (!isLlmConfigured()) {
    return Response.json({ error: "No model configured." }, { status: 503 });
  }

  const userId = await getUserId();
  if (!userId) return Response.json({ error: "no reader" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { pieceId?: string };
  const parent = body.pieceId ? getPiece(body.pieceId) : null;
  // Ownership checked with the same 404 as absence: whether a piece id exists
  // under another account is not this endpoint's to reveal.
  if (!parent || parent.userId !== userId) {
    return Response.json({ error: "unknown piece" }, { status: 404 });
  }

  // Idempotent BEFORE it is metered: re-asking for an existing follow-on is a
  // lookup, and charging a generation for it would burn the daily budget on
  // double-taps and reloads.
  const existing = existingFollowOn(parent.id);
  if (existing) return Response.json(existing);

  // AT MOST ONE speculative piece outstanding, ever. Without this, a reader
  // who finishes pieces but always composes their own next topic spawns one
  // unread generation per finish - a quota leak that grows with exactly the
  // behaviour it fails to serve. If something written ahead is still unread,
  // the answer to "what's next?" is THAT, not a fresh spend; the chip and the
  // home card point at it, and no new prefetch happens until it is read. The
  // feature self-calibrates: readers who follow suggestions get a fresh one
  // each time, readers who ignore them stop costing anything.
  const outstanding = unreadFollowOn(userId, parent.language);
  if (outstanding) return Response.json(outstanding);

  // Only a FINISHED piece earns a follow-on. The reader proves they finish
  // things before the app starts writing ahead of them - without this, opening
  // ten pieces queues ten speculative generations.
  const finished = getDb()
    .prepare(`SELECT 1 FROM sessions WHERE piece_id = ? AND user_id = ? LIMIT 1`)
    .get(parent.id, userId);
  if (!finished) {
    return Response.json({ error: "finish this piece first" }, { status: 409 });
  }

  const byIp = spendIp(PLANS.generate, clientIp(req));
  if (!byIp.ok) return tooMany(byIp, TOO_MANY);
  const byUser = spendUser(PLANS.generate, userId);
  if (!byUser.ok) return tooMany(byUser, TOO_MANY);

  const profile = getProfile(userId, parent.language);
  if (!profile) {
    return Response.json({ error: "no profile for this language" }, { status: 409 });
  }

  try {
    const { id, piece } = await generatePiece({
      userId,
      // The profile's CURRENT level, not the parent's stored one - the session
      // that triggered this prefetch may just have moved it.
      level: profile.level,
      format: parent.format as Format,
      topic: followOnTopic(parent),
      language: getLanguage(parent.language),
      length: lengthLike(parent.report.totalWords),
      parentId: parent.id,
    });
    return Response.json({ id, title: piece.title });
  } catch (err) {
    console.error("prefetch failed", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "generation failed" },
      { status: 502 },
    );
  }
}
