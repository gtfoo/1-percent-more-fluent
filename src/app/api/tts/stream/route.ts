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
  synthesisInFlight,
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
    spoken.mode === "dialogue"
      ? dialogueHash(spoken.inputs)
      : narrationHash(spoken.text, piece.language);

  /**
   * Relative, deliberately.
   *
   * `Response.redirect` demands an absolute URL, and the only origin available
   * here is the one the app sees - which behind Caddy is its own bind address.
   * In production that sent every reader to `https://localhost:3100/audio/...`:
   * their own machine, on a port with nothing on it. Silently, because a
   * redirect the browser cannot follow is not an error the page ever sees.
   *
   * A relative Location is resolved against whatever the browser actually asked
   * for, so it is correct on localhost, behind a proxy, and under any hostname
   * without the server having to know which it is.
   */
  const toFile = () =>
    new Response(null, { status: 302, headers: { Location: `/audio/${hash}.mp3` } });

  // Already spoken. Redirect rather than re-stream: the static file supports
  // range requests and therefore seeking, which a synthesised stream does not.
  if (await clipExists(hash)) return toFile();

  // Not on disk, which is not the same as nobody having paid for it. If this
  // clip is being synthesised right now - a double tap on Listen, or a reload
  // while waiting - wait for that attempt instead of buying a second copy.
  //
  // Whoever asked second loses the early playback and gets the finished file,
  // which is the better half of the trade anyway: a static file seeks. Sharing
  // the live stream is not an option, since a stream can only be read once.
  const pending = synthesisInFlight(hash);
  if (pending) {
    // Bounded, because a request that hangs for ever is worse than a rare
    // second charge. Comfortably longer than any synthesis under the character
    // cap; the longest measured is a few seconds.
    const timedOut = Symbol("timed out");
    const outcome = await Promise.race([
      pending,
      new Promise((r) => setTimeout(() => r(timedOut), 120_000)),
    ]);
    // If that attempt succeeded the file is there now. If it failed, or timed
    // out, fall through and synthesise properly rather than redirect at a 404.
    if (outcome !== timedOut && (await clipExists(hash))) return toFile();
  }

  try {
    const stream =
      spoken.mode === "dialogue"
        ? await streamDialogue(spoken.turns, piece.speakers, piece.id, piece.language)
        : await streamNarration(spoken.text, piece.id, piece.language);

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
