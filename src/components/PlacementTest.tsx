"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Sample {
  level: number;
  text: string;
}

interface Result {
  vocabEstimate: number;
  falseAlarmRate: number;
  unreliable: boolean;
  testLevel: number;
  readbackLevel: number | null;
  level: number;
  label: string;
}

export interface LanguageChoice {
  code: string;
  name: string;
  fontStack: string;
}

type Step = "language" | "words" | "readback" | "done";

/** Chosen when even the easiest sample is out of reach, or none of them are. */
const BELOW_EASIEST = 0;
const ABOVE_HARDEST = 95;

export function PlacementTest({ languages }: { languages: LanguageChoice[] }) {
  const router = useRouter();
  const [language, setLanguage] = useState<LanguageChoice>(languages[0]!);
  const [items, setItems] = useState<string[] | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [known, setKnown] = useState<Set<string>>(new Set());
  // Skip straight past the choice when there is only one language to choose.
  const [step, setStep] = useState<Step>(
    languages.length > 1 ? "language" : "words",
  );
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped to pull a fresh sample of test items; the effect only ever sets
  // state from the async callback, never synchronously in its body.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/placement?language=${encodeURIComponent(language.code)}`)
      .then((r) => r.json())
      .then((d: { items: string[]; samples: Sample[] }) => {
        if (cancelled) return;
        setItems(d.items);
        setSamples(d.samples ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the test.");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, language.code]);

  function toggle(word: string) {
    setKnown((prev) => {
      const next = new Set(prev);
      if (next.has(word)) next.delete(word);
      else next.add(word);
      return next;
    });
  }

  /**
   * `readbackLevel` is null when the read-back step was skipped - which happens
   * for a language whose graded samples have not been generated yet. The word
   * test alone is a weaker estimate, but a weaker estimate beats a blank screen,
   * and the API already treats null as "no read-back evidence".
   */
  async function submit(readbackLevel: number | null) {
    if (!items) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shown: items,
          known: [...known],
          readbackLevel,
          language: language.code,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "failed");
      setResult(await res.json());
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !items) return <p className="text-warn">{error}</p>;

  // --- Step 0: which language ---------------------------------------------
  if (step === "language") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            What are you learning?
          </h1>
          <p className="mt-2 max-w-xl text-muted">
            Each language keeps its own level, so switching later doesn’t lose
            where you got to.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {languages.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setLanguage(l);
                setKnown(new Set());
                setItems(null);
                setStep("words");
              }}
              className="rounded-xl border border-border bg-surface px-5 py-4 text-lg hover:border-accent"
              style={{ fontFamily: l.fontStack }}
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- Step 3: the result -------------------------------------------------
  if (step === "done" && result) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            You’re around <span className="text-accent">{result.label}</span>
          </h1>
          <p className="mt-2 text-muted">
            The word test put you at roughly{" "}
            {result.vocabEstimate.toLocaleString()} words. Nothing is locked in —
            the level adjusts after every piece you read, based on how much you
            actually look up.
          </p>
        </div>

        {result.unreliable && (
          <p className="rounded-lg border border-border bg-accent-soft px-4 py-3 text-sm">
            You marked a lot of the invented words as known, so the word test
            counted for less here. It will correct itself as you read.
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
              setStep("words");
              setItems(null);
              setReloadKey((k) => k + 1);
            }}
            className="rounded-lg border border-border px-4 py-2 hover:bg-surface"
          >
            Test again
          </button>
        </div>
      </div>
    );
  }

  // --- Step 2: the read-back check ----------------------------------------
  // A word test can be fooled - cognates especially - so before committing to a
  // number we show real graded Spanish and let the learner point at it. This is
  // the check that catches a badly wrong estimate in twenty seconds instead of
  // over several reading sessions.
  if (step === "readback") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Which of these can you read comfortably?
          </h1>
          <p className="mt-2 max-w-xl text-muted">
            They get harder going down, and each is about something different —
            so you can’t guess a hard one from an easy one. Pick the last you
            could follow without stopping; you don’t need every word, just the
            sense of it.
          </p>
        </div>

        <button
          onClick={() => submit(BELOW_EASIEST)}
          disabled={submitting}
          className="w-full rounded-lg border border-border px-4 py-3 text-left hover:border-accent disabled:opacity-50"
        >
          <span className="font-medium">None of them — even the first is hard</span>
        </button>

        {samples.map((sample, i) => (
          <div key={sample.level} className="rounded-xl border border-border bg-surface">
            <p
              className="prose-reading px-5 py-4 !text-lg"
              style={{ fontFamily: language.fontStack }}
            >
              {sample.text}
            </p>
            <button
              onClick={() => submit(sample.level)}
              disabled={submitting}
              className="w-full border-t border-border px-5 py-3 text-left font-medium hover:bg-accent-soft disabled:opacity-50"
            >
              {i === samples.length - 1
                ? "I can read this one"
                : "This is the last one I can follow"}
            </button>
          </div>
        ))}

        <button
          onClick={() => submit(ABOVE_HARDEST)}
          disabled={submitting}
          className="w-full rounded-lg border border-border px-4 py-3 text-left hover:border-accent disabled:opacity-50"
        >
          <span className="font-medium">All of them were easy</span>
        </button>

        {error && <p className="text-warn">{error}</p>}
      </div>
    );
  }

  // --- Step 1: the yes/no word test ---------------------------------------
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Which of these do you know?
        </h1>
        <p className="mt-2 max-w-xl text-muted">
          Tap every word whose meaning you could give. Skip the ones you can’t.
          Some of them are invented words that only look like {language.name} — that’s
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
                  style={{ fontFamily: language.fontStack }}
                >
                  {word}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4 border-t border-border pt-5">
            <button
              onClick={() => (samples.length ? setStep("readback") : submit(null))}
              disabled={submitting}
              className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {samples.length ? "Next" : submitting ? "Scoring…" : "Done"}
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
