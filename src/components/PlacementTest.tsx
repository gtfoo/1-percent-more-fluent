"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Result {
  vocabEstimate: number;
  falseAlarmRate: number;
  unreliable: boolean;
  level: number;
  cefr: string;
}

export function PlacementTest() {
  const router = useRouter();
  const [items, setItems] = useState<string[] | null>(null);
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/placement")
      .then((r) => r.json())
      .then((d: { items: string[] }) => setItems(d.items))
      .catch(() => setError("Could not load the test."));
  }, []);

  function toggle(word: string) {
    setKnown((prev) => {
      const next = new Set(prev);
      if (next.has(word)) next.delete(word);
      else next.add(word);
      return next;
    });
  }

  async function submit() {
    if (!items) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shown: items, known: [...known] }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "failed");
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !items) {
    return <p className="text-warn">{error}</p>;
  }

  if (result) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            You know roughly{" "}
            <span className="text-accent">
              {result.vocabEstimate.toLocaleString()}
            </span>{" "}
            Spanish words
          </h1>
          <p className="mt-2 text-muted">
            That puts you around <strong>{result.cefr}</strong>. Nothing is locked
            in — the level adjusts after every piece you read, based on how much
            you actually look up.
          </p>
        </div>

        {result.unreliable && (
          <p className="rounded-lg border border-border bg-accent-soft px-4 py-3 text-sm">
            You marked a lot of the invented words as known, so this estimate is
            a rough one. It will correct itself quickly as you read.
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => router.push("/")}
            className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:opacity-90"
          >
            Start reading
          </button>
          <button
            onClick={() => {
              setResult(null);
              setKnown(new Set());
              setItems(null);
              fetch("/api/placement")
                .then((r) => r.json())
                .then((d: { items: string[] }) => setItems(d.items));
            }}
            className="rounded-lg border border-border px-4 py-2 hover:bg-surface"
          >
            Test again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Which of these do you know?
        </h1>
        <p className="mt-2 max-w-xl text-muted">
          Tap every word whose meaning you could give. Skip the ones you can’t.
          Some of them are invented words that only look Spanish — that’s
          deliberate, and it’s what makes the estimate honest, so don’t guess.
        </p>
      </div>

      {!items ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {items.map((word) => {
              const on = known.has(word);
              return (
                <button
                  key={word}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(word)}
                  className={`rounded-full border px-4 py-2 text-lg transition-colors ${
                    on
                      ? "border-accent bg-accent text-white"
                      : "border-border bg-surface hover:border-accent"
                  }`}
                  style={{ fontFamily: "var(--font-reading), Georgia, serif" }}
                >
                  {word}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4 border-t border-border pt-5">
            <button
              onClick={submit}
              disabled={submitting}
              className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Scoring…" : "Done"}
            </button>
            <span className="text-sm text-muted">
              {known.size} of {items.length} marked
            </span>
          </div>
          {error && <p className="text-warn">{error}</p>}
        </>
      )}
    </div>
  );
}
