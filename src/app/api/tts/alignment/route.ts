import type { NextRequest } from "next/server";
import { getPiece } from "@/server/generate";
import { dialogueHash, narrationHash, readAlignment, spokenTextFor } from "@/server/tts";

/**
 * The character timings for a piece's narration, once they exist.
 *
 * THIS ROUTE NEVER SYNTHESISES. That is the whole point of it. The audio and
 * its timings cannot travel in the same response - one is audio/mpeg, the other
 * is JSON - so the reader makes two requests, and the obvious shape of that
 * (each request generating what it needs) would bill every narration twice.
 * The stream route writes both files; this one waits for the JSON to land.
 *
 * 202 means "not yet" - the stream is still running. The reader polls, and the
 * audio plays throughout; highlighting simply switches on when this answers.
 * That is the accepted trade: today the reader gets neither until both are
 * ready.
 *
 * Free and unmetered, deliberately. It spends nothing, and rate-limiting a poll
 * would only stop the highlighting from ever arriving.
 */
export async function GET(req: NextRequest) {
  const pieceId = req.nextUrl.searchParams.get("piece");
  const piece = pieceId ? getPiece(pieceId) : null;
  if (!piece) return Response.json({ error: "unknown piece" }, { status: 404 });

  const spoken = spokenTextFor(piece);
  const hash =
    spoken.mode === "dialogue"
      ? dialogueHash(spoken.inputs)
      : narrationHash(spoken.text, piece.language);

  const alignment = await readAlignment(hash);
  if (!alignment) {
    return Response.json({ ready: false }, { status: 202 });
  }

  // The mode travels with it: a dialogue's timings index into the turns
  // concatenated WITHOUT their speaker prefixes, so the reader has to map
  // offsets differently. Getting this wrong desynchronises the highlight
  // rather than failing.
  return Response.json({ ready: true, alignment, mode: spoken.mode });
}
