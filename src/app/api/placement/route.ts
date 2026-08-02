import type { NextRequest } from "next/server";
import { buildTest, score } from "@/server/placement";
import { getOrCreateUserId, setPlacement } from "@/server/user";
import { clampLevel, labelFor, levelForVocab } from "@/lib/level";
import { DEFAULT_LANGUAGE, getLanguage } from "@/lib/languages";
import { gradedSamples } from "@/server/frequency";

/**
 * How much the read-back check counts against the word test - asymmetrically.
 *
 * The read-back is grounded self-report: the learner is looking at real graded
 * text rather than naming a CEFR level in the abstract. But it is still
 * self-report, and self-report fails in one direction far more than the other.
 * Almost nobody claims to understand less than they do; plenty of people
 * overestimate, especially with a familiar topic in front of them.
 *
 * So it is trusted heavily when it says "lower than the word test" - that is
 * the case it exists to catch, someone the word test rated C2 who cannot read
 * an A1 paragraph - and only lightly when it says "higher". A flat 65% took a
 * word test of 55 and stored 75, which is the wrong direction to be generous in.
 */
const READBACK_WEIGHT_DOWN = 0.75;
const READBACK_WEIGHT_UP = 0.3;

/** However confident the reader is, the word test still bounds the optimism. */
const MAX_UPWARD_OVERRIDE = 10;

/**
 * Combine the objective word test with the reader's own read-back choice.
 * Exported so `scripts/check-calibration.ts` can assert the asymmetry holds.
 */
export function blendReadback(
  testLevel: number,
  readbackLevel: number | null,
): number {
  if (readbackLevel === null) return testLevel;

  const weight =
    readbackLevel < testLevel ? READBACK_WEIGHT_DOWN : READBACK_WEIGHT_UP;
  const blended = weight * readbackLevel + (1 - weight) * testLevel;

  return readbackLevel > testLevel
    ? Math.min(blended, testLevel + MAX_UPWARD_OVERRIDE)
    : blended;
}

/** A fresh sample of test items, plus the graded paragraphs for the read-back. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("language") ?? DEFAULT_LANGUAGE;
  return Response.json({
    items: buildTest(code),
    samples: gradedSamples(code).map((s) => ({ level: s.level, text: s.text })),
  });
}

export async function POST(req: NextRequest) {
  const userId = await getOrCreateUserId();

  const body = (await req.json()) as {
    shown?: unknown;
    known?: unknown;
    readbackLevel?: unknown;
    language?: unknown;
  };
  if (!Array.isArray(body.shown) || !Array.isArray(body.known)) {
    return Response.json({ error: "shown and known must be arrays" }, { status: 400 });
  }

  const shown = body.shown.filter((w): w is string => typeof w === "string");
  const known = body.known.filter((w): w is string => typeof w === "string");
  if (!shown.length) {
    return Response.json({ error: "no items answered" }, { status: 400 });
  }

  const language = getLanguage(
    typeof body.language === "string" ? body.language : DEFAULT_LANGUAGE,
  );

  const result = score(shown, known, language.code);
  const testLevel = levelForVocab(result.vocabEstimate);

  const readbackLevel =
    typeof body.readbackLevel === "number" ? clampLevel(body.readbackLevel) : null;

  const level = clampLevel(blendReadback(testLevel, readbackLevel));

  const profile = setPlacement(userId, result.vocabEstimate, language.code, level);

  return Response.json({
    ...result,
    testLevel,
    readbackLevel,
    level: profile.level,
    label: labelFor(profile.level, language),
  });
}
