import type { NextRequest } from "next/server";
import { getOrCreateUserId, getProfile, setLevel } from "@/server/user";
import { cefrFor, overrideLevel, paramsFor } from "@/lib/level";

/**
 * The escape hatch: the reader saying outright that the level is wrong.
 *
 * Separate from /api/session because it is not a calibration signal to be
 * weighed against others - it is an override, applied immediately and at full
 * size. Waiting several sessions for the controller to converge is not a
 * reasonable thing to ask of someone staring at text they cannot read.
 */
export async function POST(req: NextRequest) {
  const userId = await getOrCreateUserId();
  const profile = getProfile(userId);
  if (!profile) return Response.json({ error: "no profile" }, { status: 409 });

  const { direction } = (await req.json()) as { direction?: string };
  if (direction !== "easier" && direction !== "harder") {
    return Response.json(
      { error: "direction must be 'easier' or 'harder'" },
      { status: 400 },
    );
  }

  const after = overrideLevel(profile.level, direction);
  setLevel(userId, after);

  return Response.json({
    level: after,
    cefr: cefrFor(after),
    vocabBand: paramsFor(after).vocabBand,
  });
}
