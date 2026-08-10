import type { NextRequest } from "next/server";
import { getOrCreateUserId, getProfile } from "@/server/user";
import { generatePiece } from "@/server/generate";
import { FORMATS, type Format } from "@/lib/formats";
import { isLlmConfigured, keyVarFor, missingKeys } from "@/server/llm";
import { LENGTH_WORDS, type Length } from "@/lib/level";
import { getLanguage } from "@/lib/languages";
import { clientIp, PLANS, spendIp, spendUser, tooMany } from "@/server/limits";

const MAX_TOPIC_CHARS = 200;
const TOO_MANY = "That is a lot of writing for one day. Try again a bit later.";

export async function POST(req: NextRequest) {
  if (!isLlmConfigured()) {
    // Name the keys the configured chain actually wants, rather than hard-coding
    // Google's - the chain crosses providers now, and "set the Gemini key" is
    // the wrong instruction when the chain asks for Anthropic.
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

  // Counted BEFORE the user is resolved, because getOrCreateUserId writes a
  // row: without this, an unlimited number of requests each arrive as a brand
  // new reader and the per-reader ceiling below never binds on anyone.
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

  try {
    const { id, report, attempts } = await generatePiece({
      userId,
      level: profile.level,
      // The learner's own language, from their profile - never a default.
      language: getLanguage(profile.language),
      format,
      topic,
      length,
    });
    return Response.json({
      id,
      attempts,
      passes: report.passes,
      outOfBandRate: report.outOfBandRate,
    });
  } catch (err) {
    console.error("generation failed", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "generation failed" },
      { status: 502 },
    );
  }
}
