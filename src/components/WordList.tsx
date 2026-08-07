"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UiStrings } from "@/lib/ui-strings";

/**
 * What the server already resolved. `pieceLabel` arrives pre-formatted because
 * the interpolating strings are functions, and a function cannot be handed to a
 * client component - see UiFormatters.
 */
export interface WordRow {
  word: string;
  meaning: string | null;
  pronunciation?: string;
  pieces: number;
  pieceLabel: string | null;
}

export function WordList({
  rows,
  t,
  fontStack,
}: {
  rows: WordRow[];
  t: UiStrings;
  fontStack: string;
}) {
  const router = useRouter();
  // Removed optimistically and kept out of the list even if the round-trip is
  // slow. The alternative - a row that lingers after you tap Remove - reads as
  // a broken button and gets tapped again.
  const [gone, setGone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function forget(word: string) {
    setGone((g) => [...g, word]);
    setError(null);
    try {
      const res = await fetch("/api/vocabulary", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word }),
      });
      if (!res.ok) throw new Error(t.couldNotSave);
      // So the count in the heading follows, and a reload does not resurrect it.
      router.refresh();
    } catch (err) {
      setGone((g) => g.filter((w) => w !== word));
      setError(err instanceof Error ? err.message : t.somethingWentWrong);
    }
  }

  const visible = rows.filter((r) => !gone.includes(r.word));

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {visible.map((row) => (
          <li
            key={row.word}
            className="flex items-baseline justify-between gap-4 px-5 py-3"
          >
            <div className="min-w-0">
              <span className="text-lg font-medium" style={{ fontFamily: fontStack }}>
                {row.word}
              </span>
              {row.pronunciation && (
                <span className="ml-2 text-sm text-muted">{row.pronunciation}</span>
              )}
              {row.pieces > 1 && row.pieceLabel && (
                <span
                  title={row.pieceLabel}
                  className="ml-2 rounded border border-border px-1.5 py-0.5 text-xs text-muted"
                >
                  ×{row.pieces}
                </span>
              )}
              {row.meaning && (
                <p className="truncate text-sm text-muted">{row.meaning}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => forget(row.word)}
              className="shrink-0 text-sm text-muted underline-offset-4 hover:text-accent hover:underline"
            >
              {t.removeWord}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
