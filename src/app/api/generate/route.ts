import type { NextRequest } from "next/server";
import { getOrCreateUserId, getProfile } from "@/server/user";
import { generatePiece } from "@/server/generate";
import { FORMATS, type Format } from "@/lib/formats";
import { isLlmConfigured } from "@/server/llm";
import { LENGTH_WORDS, type Length } from "@/lib/level";

const MAX_TOPIC_CHARS = 200;

export async function POST(req: NextRequest) {
  if (!isLlmConfigured()) {
    return Response.json(
      { error: "No model configured. Set GOOGLE_GENERATIVE_AI_API_KEY in .env.local." },
      { status: 503 },
    );
  }

  const userId = await getOrCreateUserId();
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
