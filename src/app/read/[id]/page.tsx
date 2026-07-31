import { notFound } from "next/navigation";
import { getPiece } from "@/server/generate";
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

  return (
    <Reader
      ttsReady={isTtsConfigured()}
      piece={{
        id: piece.id,
        title: piece.title,
        format: piece.format,
        paragraphs: piece.paragraphs,
        questions: piece.questions,
        totalWords: piece.report.totalWords,
        outOfBandRate: piece.report.outOfBandRate,
        passes: piece.report.passes,
      }}
    />
  );
}
