import { notFound } from "next/navigation";
import { getPiece } from "@/server/generate";
import { getUserId, getProfile, getUiPreference } from "@/server/user";
import { getLanguage } from "@/lib/languages";
import { uiFor } from "@/lib/ui";
import { isTtsConfigured } from "@/server/tts";
import { Reader } from "@/components/Reader";

export default async function ReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const piece = getPiece(id);
  if (!piece) notFound();

  // The chrome follows the reader's level in the PIECE's language, so opening
  // an old Spanish story does not hand you Chinese buttons.
  const userId = await getUserId();
  const profile = userId ? getProfile(userId, piece.language) : null;
  const { strings: t } = uiFor(
    getLanguage(piece.language),
    profile?.level ?? 0,
    await getUiPreference(),
  );

  return (
    <Reader
      ttsReady={isTtsConfigured()}
      t={t}
      piece={{
        id: piece.id,
        title: piece.title,
        format: piece.format,
        language: piece.language,
        paragraphs: piece.paragraphs,
        speakers: piece.speakers,
        questions: piece.questions,
        terms: piece.terms,
        totalWords: piece.report.totalWords,
        outOfBandRate: piece.report.outOfBandRate,
        passes: piece.report.passes,
      }}
    />
  );
}
