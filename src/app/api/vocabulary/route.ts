import type { NextRequest } from "next/server";
import { getUserId, getProfile } from "@/server/user";
import { forgetWord } from "@/server/vocabulary";

/**
 * Drop a word from the reader's list.
 *
 * Scoped through the profile rather than a language sent by the caller, so this
 * can only ever delete from the language currently in play - the same one the
 * page rendered.
 */
export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  const profile = userId ? getProfile(userId) : null;
  if (!profile) return Response.json({ error: "not placed" }, { status: 401 });

  const body = (await req.json()) as { word?: string };
  const word = (body.word ?? "").trim();
  if (!word) return Response.json({ error: "word is required" }, { status: 400 });

  forgetWord(profile.userId, profile.language, word);
  return Response.json({ ok: true });
}
