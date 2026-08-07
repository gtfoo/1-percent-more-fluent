import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserId, getProfile, getUiPreference } from "@/server/user";
import { listVocabulary } from "@/server/vocabulary";
import { getLanguage } from "@/lib/languages";
import { uiFor } from "@/lib/ui";
import { WordList, type WordRow } from "@/components/WordList";

export default async function Words() {
  const userId = await getUserId();
  const profile = userId ? getProfile(userId) : null;
  // Nothing to show before placement, and the home page owns that story.
  if (!profile) redirect("/");

  const language = getLanguage(profile.language);
  const { strings: t, format: f } = uiFor(
    language,
    profile.level,
    await getUiPreference(),
  );

  const entries = listVocabulary(profile.userId, language.code);
  // Formatted here rather than in the component: these are functions, and
  // functions do not survive the server-to-client boundary.
  const rows: WordRow[] = entries.map((e) => ({
    word: e.word,
    meaning: e.meaning,
    ...(e.pronunciation ? { pronunciation: e.pronunciation } : {}),
    pieces: e.pieces,
    pieceLabel: e.pieces > 1 ? f.metInPieces(e.pieces) : null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t.yourWords}{" "}
          {rows.length > 0 && (
            <span className="text-base font-normal text-muted">{rows.length}</span>
          )}
        </h1>
        {rows.length > 0 && (
          <a
            href="/api/vocabulary/export"
            className="text-sm text-muted underline-offset-4 hover:text-accent hover:underline"
          >
            {t.exportWords}
          </a>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-8 text-center">
          <p className="font-medium">{t.noWordsYet}</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            {t.noWordsYetNote}
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90"
          >
            {t.whatToRead}
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">{t.yourWordsNote}</p>
          <WordList rows={rows} t={t} fontStack={language.fontStack} />
        </>
      )}
    </div>
  );
}
