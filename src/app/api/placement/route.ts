import type { NextRequest } from "next/server";
import { buildTest, score } from "@/server/placement";
import { getOrCreateUserId, setPlacement } from "@/server/user";
import { cefrFor, clampLevel, levelForVocab } from "@/lib/level";
import samples from "@/data/es/samples.json";

/**
 * How much the read-back check counts against the word test.
 *
 * The read-back is still self-report, but it is *grounded* self-report - the
 * learner is looking at real graded Spanish rather than being asked to name a
 * CEFR level in the abstract - so it earns most of the weight. The word test
 * keeps a meaningful share because it is the only genuinely objective signal.
 */
const READBACK_WEIGHT = 0.65;

/** A fresh sample of test items, plus the graded paragraphs for the read-back. */
export async function GET() {
  return Response.json({
    items: buildTest(),
    samples: (samples.samples as { level: number; text: string }[]).map((s) => ({
      level: s.level,
      text: s.text,
    })),
  });
}

export async function POST(req: NextRequest) {
  const userId = await getOrCreateUserId();

  const body = (await req.json()) as {
    shown?: unknown;
    known?: unknown;
    readbackLevel?: unknown;
  };
  if (!Array.isArray(body.shown) || !Array.isArray(body.known)) {
    return Response.json({ error: "shown and known must be arrays" }, { status: 400 });
  }

  const shown = body.shown.filter((w): w is string => typeof w === "string");
  const known = body.known.filter((w): w is string => typeof w === "string");
  if (!shown.length) {
    return Response.json({ error: "no items answered" }, { status: 400 });
  }

  const result = score(shown, known);
  const testLevel = levelForVocab(result.vocabEstimate);

  const readbackLevel =
    typeof body.readbackLevel === "number" ? clampLevel(body.readbackLevel) : null;

  const level =
    readbackLevel === null
      ? testLevel
      : clampLevel(
          READBACK_WEIGHT * readbackLevel + (1 - READBACK_WEIGHT) * testLevel,
        );

  const profile = setPlacement(userId, result.vocabEstimate, "es", level);

  return Response.json({
    ...result,
    testLevel,
    readbackLevel,
    level: profile.level,
    cefr: cefrFor(profile.level),
  });
}
