import type { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/server/user";
import { getPiece } from "@/server/generate";
import { isTtsConfigured, narrate, narrateDialogue } from "@/server/tts";
import { splitTurns } from "@/lib/dialogue";

/**
 * Narrate a stored piece. Deliberately takes a piece id, not free text: audio
 * is the expensive resource, and this way it can only ever be spent on
 * something already generated, verified, and shown to the reader.
 */
export async function POST(req: NextRequest) {
  if (!isTtsConfigured()) {
    return Response.json(
      { error: "No speech configured. Set ELEVENLABS_API_KEY in .env.local." },
      { status: 503 },
    );
  }

  await getOrCreateUserId();

  const { pieceId } = (await req.json()) as { pieceId?: string };
  const piece = pieceId ? getPiece(pieceId) : null;
  if (!piece) return Response.json({ error: "unknown piece" }, { status: 404 });

  try {
    // A conversation is spoken as a dialogue: one voice per character, and the
    // speaker names never read aloud. Everything else gets a single narrator.
    //
    // The two paths return alignments in DIFFERENT coordinate spaces - a
    // dialogue's timings index into the turns concatenated without their name
    // prefixes - so the reader is told which it got and maps offsets to match.
    if (piece.format === "conversation") {
      const turns = splitTurns(piece.paragraphs, piece.speakers);
      const narration = await narrateDialogue(turns, piece.speakers, piece.id);
      return Response.json({ ...narration, mode: "dialogue" });
    }

    // Must match exactly what the reader renders, or the timings will not line up.
    const narration = await narrate(piece.paragraphs.join("\n\n"), piece.id);
    return Response.json({ ...narration, mode: "narration" });
  } catch (err) {
    console.error("tts failed", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "narration failed" },
      { status: 502 },
    );
  }
}
