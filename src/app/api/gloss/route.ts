import type { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/server/user";
import { glossWord, recordLookup } from "@/server/gloss";
import { getPiece } from "@/server/generate";
import { DEFAULT_LANGUAGE } from "@/lib/languages";

export async function POST(req: NextRequest) {
  const userId = await getOrCreateUserId();

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
