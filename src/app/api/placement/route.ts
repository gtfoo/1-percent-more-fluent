import type { NextRequest } from "next/server";
import { buildTest, score } from "@/server/placement";
import { getOrCreateUserId, setPlacement } from "@/server/user";
import { cefrFor } from "@/lib/level";

/** A fresh sample of test items. Real words and pseudowords are not labelled. */
export async function GET() {
  return Response.json({ items: buildTest() });
}

export async function POST(req: NextRequest) {
  const userId = await getOrCreateUserId();

  const body = (await req.json()) as { shown?: unknown; known?: unknown };
  if (!Array.isArray(body.shown) || !Array.isArray(body.known)) {
    return Response.json({ error: "shown and known must be arrays" }, { status: 400 });
  }

  const shown = body.shown.filter((w): w is string => typeof w === "string");
  const known = body.known.filter((w): w is string => typeof w === "string");
  if (!shown.length) {
    return Response.json({ error: "no items answered" }, { status: 400 });
  }

  const result = score(shown, known);
  const profile = setPlacement(userId, result.vocabEstimate);

  return Response.json({
    ...result,
    level: profile.level,
    cefr: cefrFor(profile.level),
  });
}
