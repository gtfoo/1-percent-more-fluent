import type { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/server/user";
import { getPiece } from "@/server/generate";
import { isTtsConfigured, narrate } from "@/server/tts";
import { splitTurns } from "@/lib/dialogue";
import { clientIp, PLANS, spendIp, spendUser, tooMany } from "@/server/limits";

/**
 * Speak one word or phrase from a piece.
 *
 * Separate from the whole-piece narration because the guard is what matters
 * here. The site is open, so an endpoint that synthesises whatever text it is
 * handed is free text-to-speech for anyone who finds it - and speech is the
 * expensive half of this product. So the request names a PIECE, and the text
 * has to actually occur in it.
 *
 * The cost of a legitimate call is negligible: a Chinese word is two or three
 * characters, a fraction of a cent, and the existing cache is keyed by content
 * hash so the same word is never paid for twice however many readers tap it.
 */

/** Long enough for a phrase a reader might select, short enough to be safe. */
const MAX_CHARS = 60;
const TOO_MANY = "That is a lot of listening at once. Try again in a little while.";

export async function POST(req: NextRequest) {
  if (!isTtsConfigured()) {
    return Response.json({ error: "No speech configured." }, { status: 503 });
  }

  // Each call is only a word, so the per-call cost is small - but the ceiling
  // is on the loop, not the call. The guard below already refuses text that is
  // not in the piece; this refuses too much of even the allowed text.
  const byIp = spendIp(PLANS.wordTts, clientIp(req));
  if (!byIp.ok) return tooMany(byIp, TOO_MANY);

  const userId = await getOrCreateUserId();
  const byUser = spendUser(PLANS.wordTts, userId);
  if (!byUser.ok) return tooMany(byUser, TOO_MANY);

  const { pieceId, text } = (await req.json()) as {
    pieceId?: string;
    text?: string;
  };

  const wanted = (text ?? "").trim();
  if (!wanted) return Response.json({ error: "no text" }, { status: 400 });
  if (wanted.length > MAX_CHARS) {
    return Response.json({ error: "too long" }, { status: 400 });
  }

  const piece = pieceId ? getPiece(pieceId) : null;
  if (!piece) return Response.json({ error: "unknown piece" }, { status: 404 });

  // The whole of what the reader can see, including speaker names - they are
  // rendered, so selecting one is legitimate even though narration skips them.
  const haystack = [
    ...piece.paragraphs,
    ...splitTurns(piece.paragraphs, piece.speakers).map((t) => t.text),
  ].join("\n");

  if (!haystack.includes(wanted)) {
    return Response.json(
      { error: "that text is not in this piece" },
      { status: 400 },
    );
  }

  try {
    const narration = await narrate(wanted, piece.id, piece.language, "word");
    return Response.json({ url: narration.url });
  } catch (err) {
    console.error("word tts failed", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "speech failed" },
      { status: 502 },
    );
  }
}
