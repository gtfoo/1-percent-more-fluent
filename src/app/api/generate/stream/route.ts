import type { NextRequest } from "next/server";
import { getOrCreateUserId, getProfile } from "@/server/user";
import { streamPiece, type PieceEvent } from "@/server/generate";
import { FORMATS, type Format } from "@/lib/formats";
import { isLlmConfigured, keyVarFor, missingKeys } from "@/server/llm";
import { LENGTH_WORDS, type Length } from "@/lib/level";
import { getLanguage } from "@/lib/languages";
import { clientIp, PLANS, spendIp, spendUser, tooMany } from "@/server/limits";

const MAX_TOPIC_CHARS = 200;
const TOO_MANY = "That is a lot of writing for one day. Try again a bit later.";

/**
 * The same generation as its sibling, with the prose sent as it is written.
 *
 * Roughly half of a generation is spent emitting things the reader is not
 * waiting for - the glossary and the comprehension questions, which the model
 * writes after the body because that is the order the schema declares them in.
 * Waiting for all of it meant twenty seconds of nothing; this puts the first
 * words on screen in about two.
 *
 * Same spend, same limits: it is one model call either way, so the ceilings are
 * the ones /api/generate already uses rather than a second set that would let a
 * reader have both.
 *
 * Newline-delimited JSON rather than SSE. There is nothing to subscribe to and
 * no reconnection to handle - the client reads until the stream ends - and NDJSON
 * survives being read with a plain reader and a split on newlines.
 */
export async function POST(req: NextRequest) {
  if (!isLlmConfigured()) {
    const wanted = missingKeys().map(keyVarFor);
    return Response.json(
      {
        error: `No model configured. Set ${
          wanted.length ? wanted.join(" or ") : "GOOGLE_GENERATIVE_AI_API_KEY"
        } in .env.local.`,
      },
      { status: 503 },
    );
  }

  const byIp = spendIp(PLANS.generate, clientIp(req));
  if (!byIp.ok) return tooMany(byIp, TOO_MANY);

  const userId = await getOrCreateUserId();
  const byUser = spendUser(PLANS.generate, userId);
  if (!byUser.ok) return tooMany(byUser, TOO_MANY);

  const profile = getProfile(userId);
  if (!profile) {
    return Response.json({ error: "Take the placement test first." }, { status: 409 });
  }

  const body = (await req.json()) as {
    format?: string;
    topic?: string;
    length?: string;
  };

  const format = body.format as Format;
  if (!FORMATS.includes(format)) {
    return Response.json({ error: `format must be one of ${FORMATS.join(", ")}` }, { status: 400 });
  }

  const length = (body.length ?? "medium") as Length;
  if (!(length in LENGTH_WORDS)) {
    return Response.json({ error: "invalid length" }, { status: 400 });
  }

  const topic = (body.topic ?? "").trim().slice(0, MAX_TOPIC_CHARS);
  if (!topic) {
    return Response.json({ error: "topic is required" }, { status: 400 });
  }

  const events = streamPiece({
    userId,
    level: profile.level,
    language: getLanguage(profile.language),
    format,
    topic,
    length,
  });

  const encoder = new TextEncoder();
  const line = (event: PieceEvent) => encoder.encode(`${JSON.stringify(event)}\n`);

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await events.next();
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(line(next.value));
      } catch (err) {
        // The status line went out long ago, so a failure cannot become a 502.
        // It travels as a final event instead, and the client shows it the same
        // way it shows one from the non-streaming route.
        console.error("streamed generation failed", err);
        controller.enqueue(
          line({
            type: "error",
            error: err instanceof Error ? err.message : "generation failed",
          }),
        );
        controller.close();
      }
    },
    cancel() {
      // The reader navigated away mid-generation. Stop the model rather than
      // paying for the rest of a piece nobody will see.
      void events.return(undefined as never);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      // Caddy does not buffer by default, but a proxy that does would undo the
      // whole point of this route without anything appearing to be wrong.
      "X-Accel-Buffering": "no",
    },
  });
}
