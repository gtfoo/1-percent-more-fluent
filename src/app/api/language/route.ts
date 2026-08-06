import type { NextRequest } from "next/server";
import { getOrCreateUserId, getProfiles, setActiveLanguage } from "@/server/user";
import { getLanguage, LANGUAGES } from "@/lib/languages";

/** Which languages this learner has placed in, and which one is live. */
export async function GET() {
  const userId = await getOrCreateUserId();
  const profiles = getProfiles(userId);

  return Response.json({
    placed: profiles.map((p) => ({
      code: p.language,
      name: getLanguage(p.language).name,
      level: p.level,
      label: getLanguage(p.language).levelLabel(p.vocabEstimate ?? 0),
    })),
    // Everything else is something they could start, which is what the setup
    // page is for. Listed here so the switcher does not have to know the
    // registry separately.
    available: Object.entries(LANGUAGES)
      .filter(([code]) => !profiles.some((p) => p.language === code))
      .map(([code, language]) => ({ code, name: language.name })),
  });
}

/**
 * Switch the active language.
 *
 * Only accepts a language already placed in. Levels are per-language, so
 * pointing at an unplaced one would leave the learner with no level rather than
 * with a default - starting a new language means taking its placement test,
 * which is a different flow.
 */
export async function POST(req: NextRequest) {
  const userId = await getOrCreateUserId();
  const { language } = (await req.json()) as { language?: string };

  if (!language || !(language in LANGUAGES)) {
    return Response.json({ error: "unknown language" }, { status: 400 });
  }

  if (!setActiveLanguage(userId, language)) {
    return Response.json(
      { error: "take the placement test in that language first", needsPlacement: true },
      { status: 409 },
    );
  }

  return Response.json({ language });
}
