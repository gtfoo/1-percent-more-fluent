import type { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/server/user";
import { glossWord, recordLookup } from "@/server/gloss";
import { getPiece } from "@/server/generate";
import { DEFAULT_LANGUAGE } from "@/lib/languages";
import { clientIp, PLANS, spendIp, spendUser, tooMany } from "@/server/limits";

const TOO_MANY = "That is a lot of lookups at once. Try again in a little while.";

export async function POST(req: NextRequest) {
  // Charged to the address first: getOrCreateUserId below writes a user row, so
  // counting only per reader would count nothing at all for a caller that
  // simply never sends a cookie.
  //
  // A cached word costs nothing, but a word nobody has ever looked up is a
  // model call, and there is an unlimited supply of strings nobody has ever
  // looked up.
  const byIp = spendIp(PLANS.gloss, clientIp(req));
  if (!byIp.ok) return tooMany(byIp, TOO_MANY);

  const userId = await getOrCreateUserId();
  const byUser = spendUser(PLANS.gloss, userId);
  if (!byUser.ok) return tooMany(byUser, TOO_MANY);

  const body = (await req.json()) as {
    word?: string;
    sentence?: string;
    pieceId?: string;
  };

  const word = (body.word ?? "").trim();
  if (!word) return Response.json({ error: "word is required" }, { status: 400 });

  const piece = body.pieceId ? getPiece(body.pieceId) : null;
  if (body.pieceId && !piece) {
    return Response.json({ error: "unknown piece" }, { status: 404 });
  }

  const code = piece?.language ?? DEFAULT_LANGUAGE;

  // The tap is logged whether or not the definition comes from the LLM: it is
  // the difficulty signal, and the level calibration depends on it.
  if (piece) recordLookup(userId, piece.id, word, code);

  try {
    const gloss = await glossWord(word, (body.sentence ?? "").slice(0, 400), code);
    return Response.json(gloss);
  } catch (err) {
    console.error("gloss failed", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "lookup failed" },
      { status: 502 },
    );
  }
}
