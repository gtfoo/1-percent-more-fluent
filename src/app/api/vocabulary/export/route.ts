import { getUserId, getProfile } from "@/server/user";
import { listVocabulary, toTsv } from "@/server/vocabulary";

/**
 * The word list as a tab-separated file, for Anki or anything else.
 *
 * Exporting rather than building a review system: plenty of learners already
 * have one, with years of scheduling history in it, and this app has no business
 * asking them to abandon that.
 */
export async function GET() {
  const userId = await getUserId();
  const profile = userId ? getProfile(userId) : null;
  if (!profile) return Response.json({ error: "not placed" }, { status: 401 });

  const entries = listVocabulary(profile.userId, profile.language);
  const today = new Date().toISOString().slice(0, 10);

  return new Response(toTsv(entries), {
    headers: {
      // charset matters: the file is mostly non-ASCII for exactly the languages
      // that need it most.
      "Content-Type": "text/tab-separated-values; charset=utf-8",
      "Content-Disposition": `attachment; filename="fluent-${profile.language}-${today}.tsv"`,
    },
  });
}
