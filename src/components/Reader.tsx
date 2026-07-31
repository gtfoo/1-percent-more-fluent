"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { tokenize, normalizeWord } from "@/lib/spanish";

interface Gloss {
  word: string;
  meaning: string;
  lemma?: string;
  partOfSpeech?: string;
}

interface Alignment {
  characters: string[];
  starts: number[];
  ends: number[];
}

export interface ReaderPiece {
  id: string;
  title: string;
  format: string;
  paragraphs: string[];
  questions: { question: string; options: string[]; answer: number }[];
  totalWords: number;
  outOfBandRate: number;
  passes: boolean;
}

interface SessionResult {
  lookupRate: number;
  levelBefore: number;
  levelAfter: number;
  cefrBefore: string;
  cefrAfter: string;
}

/** Must match how the server joins paragraphs before sending them to TTS. */
const JOINER = "\n\n";

/** A token plus its absolute character offset in the text sent to TTS. */
interface PlacedToken {
  text: string;
  isWord: boolean;
  at: number;
}

export function Reader({
  piece,
  ttsReady,
}: {
  piece: ReaderPiece;
  ttsReady: boolean;
}) {
  const [glosses, setGlosses] = useState<Map<string, Gloss>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [glossLoading, setGlossLoading] = useState(false);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [alignment, setAlignment] = useState<Alignment | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [charIndex, setCharIndex] = useState(-1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [finishing, setFinishing] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(
    piece.questions.map(() => null),
  );
  const [rating, setRating] = useState<string | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Absolute character offsets for every token, measured against the exact
   * string the server sends to TTS. Without this the audio timings cannot be
   * mapped back onto the words on screen.
   */
  const layout = useMemo(() => {
    // Written as plain loops rather than nested `map` closures: accumulating an
    // offset inside a callback reads as mutation-after-render to the compiler,
    // even though it all happens in one pass.
    const paragraphs: PlacedToken[][] = [];
    let base = 0;

    for (const text of piece.paragraphs) {
      const placed: PlacedToken[] = [];
      let local = 0;
      for (const token of tokenize(text)) {
        placed.push({ ...token, at: base + local });
        local += token.text.length;
      }
      paragraphs.push(placed);
      base += text.length + JOINER.length;
    }

    return paragraphs;
  }, [piece.paragraphs]);

  /**
   * Follow the audio at frame rate.
   *
   * Everything is read from the media element rather than from React state,
   * and `playing` is derived here rather than set from onPlay/onPause. Those
   * events do not bubble and can be missed when playback is started
   * imperatively, and when that happened the highlight silently stopped
   * working while the audio kept going. Polling the element cannot desync.
   * `timeupdate` is no use for this - it fires about four times a second,
   * far too coarse to track individual words.
   */
  useEffect(() => {
    if (!audioUrl) return;
    let raf = 0;

    const tick = () => {
      const el = audioRef.current;
      if (el) {
        // React bails out when the value is unchanged, so this is cheap.
        setPlaying(!el.paused && !el.ended);

        if (alignment && !el.paused) {
          const t = el.currentTime;
          const ends = alignment.ends;
          let lo = 0;
          let hi = ends.length - 1;
          let found = -1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (ends[mid]! > t) {
              found = mid;
              hi = mid - 1;
            } else {
              lo = mid + 1;
            }
          }
          setCharIndex(found);
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audioUrl, alignment]);

  async function lookUp(raw: string, sentence: string) {
    const word = normalizeWord(raw);
    if (!word) return;
    setSelected(word);

    if (glosses.has(word)) return;
    setGlossLoading(true);
    try {
      const res = await fetch("/api/gloss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, sentence, pieceId: piece.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "lookup failed");
      setGlosses((prev) => new Map(prev).set(word, data as Gloss));
    } catch {
      setGlosses((prev) =>
        new Map(prev).set(word, { word, meaning: "Couldn’t look that one up." }),
      );
    } finally {
      setGlossLoading(false);
    }
  }

  async function loadAudio() {
    if (audioUrl) {
      togglePlay();
      return;
    }
    setAudioBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieceId: piece.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "narration failed");
      setAudioUrl(data.url);
      setAlignment(data.alignment ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load audio.");
    } finally {
      setAudioBusy(false);
    }
  }

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }

  // Autoplay once the file arrives, since loading it was an explicit request.
  useEffect(() => {
    if (audioUrl && audioRef.current) void audioRef.current.play();
  }, [audioUrl]);

  async function finish() {
    const answered = answers.filter((a) => a !== null).length;
    const correct = answers.filter(
      (a, i) => a !== null && a === piece.questions[i]!.answer,
    ).length;

    setError(null);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pieceId: piece.id,
          rating,
          quizScore: answered ? correct / answered : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "could not save");
      setResult(data as SessionResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  const activeGloss = selected ? glosses.get(selected) : undefined;

  return (
    <article className="space-y-8 pb-40">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wider text-muted">
          {piece.format}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{piece.title}</h1>
        <p className="text-sm text-muted">
          {piece.totalWords} words · {(piece.outOfBandRate * 100).toFixed(1)}%
          beyond your level
          {!piece.passes && " · ran over budget"}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={loadAudio}
          disabled={!ttsReady || audioBusy}
          className="rounded-lg border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent-soft disabled:opacity-40"
        >
          {audioBusy
            ? "Preparing…"
            : !audioUrl
              ? "Listen"
              : playing
                ? "Pause"
                : "Play"}
        </button>
        {!ttsReady && (
          <span className="text-sm text-muted">
            Set <code>ELEVENLABS_API_KEY</code> to enable audio.
          </span>
        )}
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            onEnded={() => setCharIndex(-1)}
            className="hidden"
          />
        )}
      </div>

      <div className="prose-reading space-y-6">
        {layout.map((tokens, i) => {
          const paragraph = piece.paragraphs[i]!;
          return (
            <p key={i}>
              {tokens.map((token, j) => {
                if (!token.isWord) return <span key={j}>{token.text}</span>;
                const key = normalizeWord(token.text);
                const isSpeaking =
                  charIndex >= token.at &&
                  charIndex < token.at + token.text.length;
                const isLookedUp = glosses.has(key);
                return (
                  <span
                    key={j}
                    role="button"
                    tabIndex={0}
                    onClick={() => lookUp(token.text, paragraph)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") lookUp(token.text, paragraph);
                    }}
                    className={`word${isLookedUp ? " looked-up" : ""}${
                      isSpeaking ? " speaking" : ""
                    }`}
                  >
                    {token.text}
                  </span>
                );
              })}
            </p>
          );
        })}
      </div>

      {/* --- Finish and calibrate ------------------------------------------ */}
      {!result && (
        <section className="space-y-6 border-t border-border pt-8">
          {!finishing ? (
            <button
              onClick={() => setFinishing(true)}
              className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90"
            >
              I’ve finished reading
            </button>
          ) : (
            <>
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">¿Entendiste?</h2>
                {piece.questions.map((q, qi) => (
                  <fieldset key={qi} className="space-y-2">
                    <legend className="font-medium">{q.question}</legend>
                    {q.options.map((opt, oi) => (
                      <label
                        key={oi}
                        className="flex cursor-pointer items-start gap-2 text-muted"
                      >
                        <input
                          type="radio"
                          name={`q${qi}`}
                          checked={answers[qi] === oi}
                          onChange={() =>
                            setAnswers((prev) => {
                              const next = [...prev];
                              next[qi] = oi;
                              return next;
                            })
                          }
                          className="mt-1.5 accent-[var(--accent)]"
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>

              <div className="space-y-3">
                <h2 className="text-xl font-semibold">How did that feel?</h2>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "too-easy", label: "Too easy" },
                    { value: "just-right", label: "Just right" },
                    { value: "too-hard", label: "Too hard" },
                  ].map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setRating(r.value)}
                      className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                        rating === r.value
                          ? "border-accent bg-accent text-white"
                          : "border-border hover:border-accent"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={finish}
                className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90"
              >
                Save and update my level
              </button>
            </>
          )}
        </section>
      )}

      {result && (
        <section className="space-y-4 border-t border-border pt-8">
          <h2 className="text-xl font-semibold">
            {result.levelAfter > result.levelBefore
              ? "Nudged up"
              : result.levelAfter < result.levelBefore
                ? "Nudged down"
                : "Level held"}
          </h2>
          <p className="text-muted">
            You looked up {(result.lookupRate * 100).toFixed(1)}% of the words
            {result.lookupRate < 0.02
              ? " — comfortably below the sweet spot, so the next piece will stretch you more."
              : result.lookupRate > 0.08
                ? " — above the sweet spot, so the next piece will ease off."
                : " — right around the sweet spot."}
          </p>
          <p className="text-muted">
            Level {result.levelBefore.toFixed(0)} → {result.levelAfter.toFixed(0)}{" "}
            ({result.cefrBefore} → {result.cefrAfter})
          </p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90"
          >
            Read something else
          </Link>
        </section>
      )}

      {error && <p className="text-warn">{error}</p>}

      {/* --- Gloss sheet ---------------------------------------------------- */}
      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface">
          <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-6 px-5 py-4">
            <div>
              <p className="text-lg font-semibold">
                {selected}
                {activeGloss?.lemma && activeGloss.lemma !== selected && (
                  <span className="ml-2 font-normal text-muted">
                    ({activeGloss.lemma})
                  </span>
                )}
              </p>
              <p className="text-muted">
                {glossLoading && !activeGloss
                  ? "Looking up…"
                  : (activeGloss?.meaning ?? "")}
                {activeGloss?.partOfSpeech && (
                  <span className="ml-2 text-sm italic">
                    {activeGloss.partOfSpeech}
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="rounded px-2 py-1 text-muted hover:text-foreground"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
