"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getLanguage } from "@/lib/languages";
import { splitTurns, type Speaker } from "@/lib/dialogue";
import { mergeTermTokens, termSpans, type TopicTerm } from "@/lib/terms";

// `import type`, so this is erased at compile time and no server code - or the
// better-sqlite3 binary behind it - reaches the client bundle. The shape was
// duplicated here before, and duplicating it is how the reader silently stopped
// showing a field the server had started returning.
import type { Gloss } from "@/server/gloss";
import type { UiStrings } from "@/lib/ui-strings";

interface Alignment {
  characters: string[];
  starts: number[];
  ends: number[];
}

export interface ReaderPiece {
  id: string;
  title: string;
  format: string;
  language: string;
  paragraphs: string[];
  speakers: Speaker[];
  questions: { question: string; options: string[]; answer: number }[];
  /** The topic terms this piece is about. Glossed from here, never fetched. */
  terms: TopicTerm[];
  totalWords: number;
  outOfBandRate: number;
  passes: boolean;
}

interface SessionResult {
  lookupRate: number;
  levelBefore: number;
  levelAfter: number;
  labelBefore: string;
  labelAfter: string;
}

/** Must match how the server joins paragraphs before sending them to TTS. */
const JOINER = "\n\n";

/** A token plus its absolute character offset in the text sent to TTS. */
interface PlacedToken {
  text: string;
  isWord: boolean;
  at: number;
  /** Index into the flat `words` list, for word tokens only. */
  wordIndex?: number;
}

export function Reader({
  piece,
  ttsReady,
  t,
}: {
  piece: ReaderPiece;
  ttsReady: boolean;
  t: UiStrings;
}) {
  const [glosses, setGlosses] = useState<Map<string, Gloss>>(new Map());
  /**
   * A RANGE of words, not a single one.
   *
   * Chinese is why. The segmenter decides where words end, and it is often
   * wrong for the learner's purpose - it splits a compound they wanted whole,
   * or joins two they wanted apart. On a phone there is no way to argue with
   * it: native text selection works character by character and fights the
   * scroll, so tapping is all you get. Holding a range and letting the reader
   * grow it a word at a time gives them the say without a gesture.
   */
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(
    null,
  );
  const [glossLoading, setGlossLoading] = useState(false);
  const [wordAudio, setWordAudio] = useState<string | null>(null);
  const [wordAudioBusy, setWordAudioBusy] = useState(false);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [alignment, setAlignment] = useState<Alignment | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /**
   * The spoken-word highlight is driven straight into the DOM rather than
   * through React state, and this is why.
   *
   * It updates every animation frame. Routing that through `setState` re-rendered
   * every word span sixty times a second, and the commit landed about 150ms
   * behind the audio - measured, not guessed. Spanish hid it: a word takes
   * roughly 450ms to say, so a late highlight was still sitting on the right
   * word. Chinese words run about 200ms, so the same lag put the highlight a
   * whole word behind for most of the piece.
   *
   * `data-speaking` is deliberately an attribute React never renders. React
   * patches only what it rendered, so a re-render for an unrelated reason - a
   * gloss arriving, say - cannot wipe the highlight the way a className would.
   */
  const wordRefs = useRef<(HTMLElement | null)[]>([]);
  const speakingRef = useRef(-1);

  const markSpeaking = useCallback((index: number) => {
    if (speakingRef.current === index) return;
    wordRefs.current[speakingRef.current]?.removeAttribute("data-speaking");
    wordRefs.current[index]?.setAttribute("data-speaking", "");
    speakingRef.current = index;
  }, []);

  // Time on the page, used only to tell "read it and understood everything"
  // apart from "opened it and gave up" - both of which produce zero lookups.
  // Stamped in an effect rather than during render: Date.now() is impure, and
  // a re-render would silently reset the clock.
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
  }, [piece.id]);
  const [override, setOverride] = useState<string | null>(null);

  const [finishing, setFinishing] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(
    piece.questions.map(() => null),
  );
  const [rating, setRating] = useState<string | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const language = getLanguage(piece.language);
  const isConversation = piece.format === "conversation";

  /**
   * Absolute character offsets for every token, measured against the exact
   * string the server sends to TTS. Without this the audio timings cannot be
   * mapped back onto the words on screen.
   *
   * The two formats live in different coordinate spaces. A narration is the
   * paragraphs joined by a blank line, exactly as sent. A conversation is sent
   * to the dialogue endpoint as turns with NO speaker names and no separators,
   * so its offsets come from `splitTurns` - which is why that split is shared
   * with the server rather than reimplemented here.
   */
  const {
    blocks: layout,
    words,
    sourceText,
  } = useMemo(() => {
    // Written as plain loops rather than nested `map` closures: accumulating an
    // offset inside a callback reads as mutation-after-render to the compiler,
    // even though it all happens in one pass.
    const blocks: { speaker: string | null; tokens: PlacedToken[] }[] = [];
    // Word tokens only, in render order, so the highlight can binary-search
    // them by character offset without walking the blocks. `block` is what
    // stops a selection being extended across a paragraph or a speaker turn.
    const words: { at: number; end: number; block: number }[] = [];

    const termStrings = piece.terms.map((t) => t.term);

    const place = (text: string, base: number, speaker: string | null) => {
      const tokens: PlacedToken[] = [];
      const block = blocks.length;
      let local = 0;
      // Merged BEFORE offsets are assigned, so a term is one tappable unit.
      // Merging joins adjacent tokens only, so the running offset - and the
      // audio alignment derived from it - is unaffected.
      const merged = mergeTermTokens(
        language.tokenize(text),
        termSpans(text, termStrings),
      );
      for (const token of merged) {
        const at = base + local;
        if (token.isWord) {
          tokens.push({ ...token, at, wordIndex: words.length });
          words.push({ at, end: at + token.text.length, block });
        } else {
          tokens.push({ ...token, at });
        }
        local += token.text.length;
      }
      blocks.push({ speaker, tokens });
    };

    if (isConversation) {
      const turns = splitTurns(piece.paragraphs, piece.speakers);
      for (const turn of turns) place(turn.text, turn.offset, turn.speaker);
      // The exact string every `at` above indexes into. Slicing it is how a
      // multi-word selection recovers its ORIGINAL text - spaces, punctuation
      // and all - rather than gluing token strings back together and guessing.
      return { blocks, words, sourceText: turns.map((t) => t.text).join("") };
    }

    let base = 0;
    for (const text of piece.paragraphs) {
      place(text, base, null);
      base += text.length + JOINER.length;
    }

    return { blocks, words, sourceText: piece.paragraphs.join(JOINER) };
  }, [piece.paragraphs, piece.speakers, piece.terms, isConversation, language]);

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
  const syncToAudio = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;

    // React bails out when the value is unchanged, so this is cheap.
    setPlaying(!el.paused && !el.ended);
    if (!alignment || el.paused) {
      // Pausing leaves the current word marked - it is still the one you
      // stopped on - but finishing should not leave the last word lit.
      if (el.ended) markSpeaking(-1);
      return;
    }

    const t = el.currentTime;
    const ends = alignment.ends;
    let lo = 0;
    let hi = ends.length - 1;
    let charIndex = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ends[mid]! > t) {
        charIndex = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }

    // Which word contains that character: the last one starting at or before it.
    let found = -1;
    if (charIndex >= 0) {
      lo = 0;
      hi = words.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (words[mid]!.at <= charIndex) {
          found = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      // Punctuation and spaces sit between words; nothing is speaking then.
      if (found >= 0 && charIndex >= words[found]!.end) found = -1;
    }

    markSpeaking(found);
  }, [alignment, words, markSpeaking]);

  // A new piece means a new set of spans; the old indices refer to nothing.
  useEffect(() => {
    wordRefs.current = [];
    speakingRef.current = -1;
  }, [words]);

  useEffect(() => {
    if (!audioUrl) return;
    let raf = 0;

    const tick = () => {
      syncToAudio();
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audioUrl, syncToAudio]);

  /**
   * The key a tapped token is stored and looked up under.
   *
   * A declared term keeps its own spelling rather than being normalised: a
   * multi-word term like "tipo de cambio" is not a single word, and
   * `normalizeWord` would mangle it.
   */
  function glossKeyFor(raw: string): string {
    const term = termFor(raw);
    return term ? term.term : language.normalizeWord(raw);
  }

  function termFor(raw: string): TopicTerm | undefined {
    const needle = raw.trim().toLowerCase();
    return piece.terms.find((t) => t.term.trim().toLowerCase() === needle);
  }

  /** The exact original text a selection covers, punctuation and spaces intact. */
  function textOf(range: { start: number; end: number }): string {
    return sourceText.slice(words[range.start]!.at, words[range.end]!.end);
  }

  /** Which sentence a selection sits in, for disambiguating the lookup. */
  function sentenceOf(range: { start: number; end: number }): string {
    const block = layout[words[range.start]!.block];
    return block ? block.tokens.map((t) => t.text).join("") : sourceText;
  }

  /**
   * Grow or shrink the selection by one word.
   *
   * Bounded twice. To the block it started in, so a selection cannot run from
   * one speaker's turn into another's. And to the sentence: extending across a
   * full stop produced "钥匙。可是" - two words from different sentences with the
   * punctuation still in the middle - which is not a phrase anyone would want
   * defined.
   */
  function extend(side: "left" | "right", by: 1 | -1) {
    if (!selection) return;
    const { start, end } = selection;
    const block = words[start]!.block;

    // Whatever sits between two words, which is where a sentence ends. A UI
    // guard rather than a parser: both scripts' terminators, kept here because
    // being slightly wrong just means one extra tap.
    const breaks = (a: number, b: number) =>
      /[.!?…。！？；\n]/.test(sourceText.slice(words[a]!.end, words[b]!.at));

    let next = selection;
    if (side === "left") {
      const i = start - by;
      if (i < 0 || i > end || words[i]!.block !== block) return;
      if (by > 0 && breaks(i, start)) return;
      next = { start: i, end };
    } else {
      const i = end + by;
      if (i >= words.length || i < start || words[i]!.block !== block) return;
      if (by > 0 && breaks(end, i)) return;
      next = { start, end: i };
    }

    setSelection(next);
    setWordAudio(null);
    void lookUpRange(next);
  }

  async function lookUpRange(range: { start: number; end: number }) {
    const raw = textOf(range);

    // A declared topic term already carries its meaning, so tapping one costs
    // no API call. It also stays out of the lookup rate, which is the point:
    // the reader is MEANT not to know these words, so tapping one is not
    // evidence the piece was pitched too hard, and counting it would push the
    // level down for reading exactly what was asked for.
    const term = termFor(raw);
    if (term) {
      setGlosses((prev) =>
        prev.has(term.term)
          ? prev
          : new Map(prev).set(term.term, {
              word: term.term,
              meaning: term.meaning,
              // Carried through, not dropped. Terms are the words a learner most
              // needs to be able to say out loud, and this short-circuit is the
              // ONLY path they take - so leaving it off meant pinyin showed for
              // ordinary words and never for the ones that mattered.
              pronunciation: term.pronunciation,
              // It came with the piece; nothing was looked up to get it.
              cached: true,
            }),
      );
      return;
    }

    const word = glossKeyFor(raw);
    if (!word) return;

    if (glosses.has(word)) return;
    setGlossLoading(true);
    try {
      const res = await fetch("/api/gloss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: raw, sentence: sentenceOf(range), pieceId: piece.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "lookup failed");
      setGlosses((prev) => new Map(prev).set(word, data as Gloss));
    } catch {
      setGlosses((prev) =>
        new Map(prev).set(word, {
          word,
          meaning: t.lookupFailed,
          cached: false,
        }),
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
      setError(err instanceof Error ? err.message : t.couldNotLoadAudio);
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
          dwellMs: Date.now() - openedAt.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "could not save");
      setResult(data as SessionResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.couldNotSave);
    }
  }

  const selectedText = selection ? textOf(selection) : null;
  const activeGloss = selectedText
    ? glosses.get(glossKeyFor(selectedText))
    : undefined;

  /** Start a new selection at one word. */
  function selectWord(i: number) {
    const range = { start: i, end: i };
    setSelection(range);
    setWordAudio(null);
    void lookUpRange(range);
  }

  /**
   * Speak just the selection.
   *
   * Deliberately a separate endpoint from the piece narration, and deliberately
   * takes the piece id: the site is open, so an endpoint that will synthesise
   * arbitrary text is somebody else's free TTS. The server checks the text
   * actually occurs in that piece before spending anything.
   */
  async function speakSelection() {
    if (!selectedText) return;
    if (wordAudio) {
      void new Audio(wordAudio).play();
      return;
    }
    setWordAudioBusy(true);
    try {
      const res = await fetch("/api/tts/word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieceId: piece.id, text: selectedText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "speech failed");
      setWordAudio(data.url);
      void new Audio(data.url).play();
    } catch {
      /* The card stays usable without audio; no need to shout about it. */
    } finally {
      setWordAudioBusy(false);
    }
  }

  async function adjustLevel(direction: "easier" | "harder") {
    try {
      const res = await fetch("/api/level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "could not adjust");
      setOverride(
        `Level moved to ${data.label} (about ${data.vocabBand.toLocaleString()} words). The next piece will be ${direction}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t.couldNotAdjust);
    }
  }

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
            ? t.preparing
            : !audioUrl
              ? t.listen
              : playing
                ? t.pause
                : t.play}
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
            // requestAnimationFrame is suspended while the tab is hidden, so on
            // its own the UI freezes mid-listen if the reader switches away -
            // stuck on "Play" while audio carries on. `timeupdate` still fires
            // when hidden, so it drives the same sync at a coarser rate.
            onTimeUpdate={syncToAudio}
            onPlay={syncToAudio}
            onPause={syncToAudio}
            onEnded={() => markSpeaking(-1)}
            className="hidden"
          />
        )}

        {/* The escape hatch. Available before finishing, because the moment you
            realise a piece is mispitched is the moment you stop reading it. */}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted">{t.mispitched}</span>
          <button
            onClick={() => adjustLevel("easier")}
            className="rounded-lg border border-border px-3 py-1.5 hover:border-accent"
          >
            {t.tooHard}
          </button>
          <button
            onClick={() => adjustLevel("harder")}
            className="rounded-lg border border-border px-3 py-1.5 hover:border-accent"
          >
            {t.tooEasy}
          </button>
        </div>
      </div>

      {override && (
        <p className="rounded-lg border border-border bg-accent-soft px-4 py-3 text-sm">
          {override}{" "}
          <Link href="/" className="underline underline-offset-4">
            {t.writeAnother}
          </Link>
        </p>
      )}

      {/* The page chrome is English; only this block is the target language.
          Marking it tells a screen reader to switch pronunciation, stops the
          browser offering to translate the whole UI, and - for Chinese - picks
          the right line-breaking rules and Han glyph variants. */}
      <div
        className="prose-reading space-y-6"
        lang={language.code}
        style={{ fontFamily: language.fontStack }}
      >
        {layout.map((block, i) => {
          // The paragraph text is no longer needed here: the gloss lookup takes
          // its context from the selection's own block.
          return (
            <p key={i}>
              {/* The name is a label, not prose: it is never spoken aloud and
                  never counts as a word the reader has to know. */}
              {block.speaker && (
                <span className="mr-2 select-none text-sm font-semibold uppercase tracking-wide text-accent">
                  {block.speaker}
                </span>
              )}
              {block.tokens.map((token, j) => {
                if (!token.isWord) return <span key={j}>{token.text}</span>;
                const key = glossKeyFor(token.text);
                const isLookedUp = glosses.has(key);
                const isTerm = Boolean(termFor(token.text));
                const w = token.wordIndex!;
                const inSelection =
                  selection !== null && w >= selection.start && w <= selection.end;
                return (
                  <span
                    key={j}
                    ref={(el) => {
                      wordRefs.current[w] = el;
                    }}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectWord(w)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") selectWord(w);
                    }}
                    className={`word${isLookedUp ? " looked-up" : ""}${
                      isTerm ? " term" : ""
                    }${inSelection ? " selected" : ""}`}
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
              {t.finishedReading}
            </button>
          ) : (
            <>
              <div className="space-y-6">
                {/* Was hard-coded "¿Entendiste?" from when the app was
                    Spanish-only, so a Chinese learner was asked in Spanish.
                    The heading is chrome, like the button above it, so it is
                    English; the questions and options are generated in the
                    target language and are marked as such below. */}
                <h2 className="text-xl font-semibold">{t.didYouFollow}</h2>
                {piece.questions.map((q, qi) => (
                  <fieldset key={qi} className="space-y-2">
                    <legend
                      className="font-medium"
                      lang={language.code}
                      style={{ fontFamily: language.fontStack }}
                    >
                      {q.question}
                    </legend>
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
                        <span
                          lang={language.code}
                          style={{ fontFamily: language.fontStack }}
                        >
                          {opt}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>

              <div className="space-y-3">
                <h2 className="text-xl font-semibold">{t.howDidThatFeel}</h2>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "too-easy", label: t.tooEasy },
                    { value: "just-right", label: t.justRight },
                    { value: "too-hard", label: t.tooHard },
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
            ({result.labelBefore} → {result.labelAfter})
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
      {selection && selectedText && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface">
          <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {/* The sheet is fixed-position, so it sits outside the prose
                    block and does not inherit its language or font. The headword
                    is target-language; everything under it is English. */}
                <p
                  className="text-lg font-semibold"
                  lang={language.code}
                  style={{ fontFamily: language.fontStack }}
                >
                  {selectedText}
                </p>

                {/* Without this a Chinese learner can read a word and still be
                    unable to say it, which is most of what they wanted it for. */}
                {activeGloss?.pronunciation && (
                  <p className="text-muted">{activeGloss.pronunciation}</p>
                )}

                {ttsReady && (
                  <button
                    onClick={speakSelection}
                    disabled={wordAudioBusy}
                    aria-label={`Listen to ${selectedText}`}
                    className="rounded-full border border-border px-2.5 py-0.5 text-sm text-muted hover:border-accent hover:text-accent disabled:opacity-40"
                  >
                    {wordAudioBusy ? "…" : "🔊"}
                  </button>
                )}

                {activeGloss?.lemma && activeGloss.lemma !== selectedText && (
                  <span className="text-sm text-muted">({activeGloss.lemma})</span>
                )}
              </div>

              <p className="mt-1 text-muted">
                {glossLoading && !activeGloss
                  ? t.lookingUp
                  : (activeGloss?.meaning ?? "")}
                {activeGloss?.partOfSpeech && (
                  <span className="ml-2 text-sm italic">
                    {activeGloss.partOfSpeech}
                  </span>
                )}
              </p>

              {/* Grow the selection a word at a time. The segmenter's idea of
                  where a word ends is often not the learner's, and on a phone
                  there is no other way to disagree with it. */}
              <div className="mt-2 flex items-center gap-1 text-sm">
                <span className="mr-1 text-muted">{t.selectMore}</span>
                <button
                  onClick={() => extend("left", 1)}
                  aria-label="Add the word before"
                  className="rounded border border-border px-2 py-0.5 text-muted hover:border-accent hover:text-accent"
                >
                  ◀
                </button>
                <button
                  onClick={() => extend("right", 1)}
                  aria-label="Add the word after"
                  className="rounded border border-border px-2 py-0.5 text-muted hover:border-accent hover:text-accent"
                >
                  ▶
                </button>
                {selection.end > selection.start && (
                  <button
                    onClick={() => selectWord(selection.start)}
                    className="ml-2 text-muted underline underline-offset-4 hover:text-accent"
                  >
                    {t.justOneWord}
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                setSelection(null);
                setWordAudio(null);
              }}
              aria-label={t.close}
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
