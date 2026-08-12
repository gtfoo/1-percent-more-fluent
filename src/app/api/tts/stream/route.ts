import type { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/server/user";
import { getPiece } from "@/server/generate";
import {
  clipExists,
  dialogueHash,
  isTtsConfigured,
  narrationHash,
  spokenTextFor,
  streamDialogue,
  streamNarration,
} from "@/server/tts";
import { clientIp, PLANS, spendIp, spendUser, tooMany } from "@/server/limits";

const TOO_MANY = "That is a lot of listening at once. Try again in a little while.";

/**
 * The audio itself, as it is synthesised.
 *
 * A GET rather than the POST its sibling uses, because this is what an
 * `<audio src>` points at - the element issues the request itself, and it can
 * only issue a GET.
 *
 * The reader used to wait for the entire clip before hearing anything: twenty
 * seconds of silence for a file the browser could have started playing almost
 * immediately. Streaming costs exactly the same - ElevenLabs bills per
 * character synthesised either way - so this is latency, not money.
 *
 * A clip that already exists is handed straight to the static file. That path
 * is free, and it is also what makes the second request for the character
 * timings safe: see the alignment route.
 */
export async function GET(req: NextRequest) {
  if (!isTtsConfigured()) {
    return Response.json({ error: "No speech configured." }, { status: 503 });
  }

  // Charged to the address before the reader is resolved, because resolving one
  // creates it. Same plan as the POST route - this is the same spend by another
  // door, and a limit that only guarded one of them would guard neither.
  const byIp = spendIp(PLANS.tts, clientIp(req));
  if (!byIp.ok) return tooMany(byIp, TOO_MANY);

  const userId = await getOrCreateUserId();
  const byUser = spendUser(PLANS.tts, userId);
  if (!byUser.ok) return tooMany(byUser, TOO_MANY);

  const pieceId = req.nextUrl.searchParams.get("piece");
  const piece = pieceId ? getPiece(pieceId) : null;
  if (!piece) return Response.json({ error: "unknown piece" }, { status: 404 });

  const spoken = spokenTextFor(piece);
  const hash =
    spoken.mode === "dialogue" ? dialogueHash(spoken.inputs) : narrationHash(spoken.text);

  // Already spoken. Redirect rather than re-stream: the static file supports
  // range requests and therefore seeking, which a synthesised stream does not.
  if (await clipExists(hash)) {
    return Response.redirect(new URL(`/audio/${hash}.mp3`, req.nextUrl.origin), 302);
  }

  try {
    const stream =
      spoken.mode === "dialogue"
        ? await streamDialogue(spoken.turns, piece.speakers, piece.id)
        : await streamNarration(spoken.text, piece.id);

    return new Response(stream, {
      headers: {
        "Content-Type": "audio/mpeg",
        // No length is known until synthesis ends, so the browser must treat
        // this as progressive rather than seekable. Seeking works on the next
        // play, from the cached file.
        "Cache-Control": "no-store",
        "X-Alignment-Hash": hash,
      },
    });
  } catch (err) {
    console.error("tts stream failed", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "narration failed" },
      { status: 502 },
    );
  }
}
