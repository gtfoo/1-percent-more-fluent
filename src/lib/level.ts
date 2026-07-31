/**
 * The level model.
 *
 * Difficulty is ONE number, 0-100, held continuously rather than in CEFR
 * buckets. Two reasons:
 *
 *  1. It is self-correcting. A continuous value can be nudged a few points
 *     after every reading session (see `nextLevel`), which is how the app
 *     converges on a learner without ever asking them to know their own CEFR
 *     rating - a thing most learners genuinely do not know.
 *
 *  2. It is verifiable. The level maps onto concrete, measurable generation
 *     parameters - a vocabulary band, a sentence length, a set of allowed
 *     tenses - rather than a vague label. Asking a model for "B1 Spanish"
 *     produces whatever it feels like; asking for "only the 2,000 most common
 *     Spanish words, 12-word sentences, present and preterite only" produces
 *     something we can check afterwards. See `src/lib/difficulty.ts`.
 *
 * The scale is anchored to vocabulary size, which predicts reading
 * comprehension better than any other single measure:
 *
 *     level   0 -> ~500 word families   (absolute beginner)
 *     level 100 -> ~24,000              (educated native reader)
 *
 * and it is geometric, because the step from 1,000 to 2,000 words is roughly
 * the same amount of learning as 10,000 to 20,000.
 */

export const MIN_VOCAB = 500;
export const MAX_VOCAB = 24_000;
const RANGE = MAX_VOCAB / MIN_VOCAB;

export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export function clampLevel(level: number): number {
  return Math.max(0, Math.min(100, level));
}

/** The vocabulary size a level corresponds to - i.e. "the top N common words". */
export function vocabSizeFor(level: number): number {
  return Math.round(MIN_VOCAB * Math.pow(RANGE, clampLevel(level) / 100));
}

/** The inverse: what level does an estimated vocabulary of `size` imply? */
export function levelForVocab(size: number): number {
  const ratio = Math.max(size, MIN_VOCAB) / MIN_VOCAB;
  return clampLevel((100 * Math.log(ratio)) / Math.log(RANGE));
}

/**
 * CEFR is shown to the learner because it is the vocabulary they expect, but
 * it is never an input. The thresholds are the widely cited vocabulary sizes
 * for each band.
 */
const CEFR_THRESHOLDS: { max: number; label: Cefr }[] = [
  { max: 1_000, label: "A1" },
  { max: 2_000, label: "A2" },
  { max: 4_000, label: "B1" },
  { max: 8_000, label: "B2" },
  { max: 16_000, label: "C1" },
  { max: Infinity, label: "C2" },
];

export function cefrFor(level: number): Cefr {
  const vocab = vocabSizeFor(level);
  return CEFR_THRESHOLDS.find((t) => vocab < t.max)!.label;
}

// --- Grammar gating ---------------------------------------------------------
// Spanish grammar arrives in a fairly consistent order for learners, so we gate
// constructions by level and tell the model explicitly what it may use. This
// matters more than vocabulary at the low end: a text can be built entirely
// from the top 500 words and still be incomprehensible to a beginner if it is
// written in the imperfect subjunctive.

export interface GrammarGate {
  minLevel: number;
  /** Described in English, because it goes straight into the prompt. */
  allows: string;
}

const GRAMMAR: GrammarGate[] = [
  { minLevel: 0, allows: "present indicative; ser/estar/hay; ir a + infinitive for the future" },
  { minLevel: 18, allows: "preterite and imperfect past tenses; direct and indirect object pronouns" },
  { minLevel: 32, allows: "present perfect; simple future; reflexive verbs; comparatives" },
  { minLevel: 46, allows: "conditional; present subjunctive in common triggers (espero que, quiero que)" },
  { minLevel: 60, allows: "full present subjunctive; relative clauses; passive with se" },
  { minLevel: 74, allows: "imperfect subjunctive; conditional perfect; complex subordination" },
  { minLevel: 88, allows: "idiomatic and literary registers; any construction" },
];

export function grammarFor(level: number): string[] {
  return GRAMMAR.filter((g) => level >= g.minLevel).map((g) => g.allows);
}

// --- Generation parameters --------------------------------------------------

export type Length = "short" | "medium" | "long";

export const LENGTH_WORDS: Record<Length, number> = {
  short: 180,
  medium: 350,
  long: 600,
};

export interface LevelParams {
  level: number;
  cefr: Cefr;
  /** Words outside the top `vocabBand` of the frequency list are "new". */
  vocabBand: number;
  /** Target mean sentence length, in words. */
  sentenceWords: number;
  allowedGrammar: string[];
  /**
   * Share of tokens permitted to fall outside the band. Never zero: a story
   * needs its own nouns, and a few unknown words per page is exactly the
   * condition under which reading builds vocabulary. Beginners get a wider
   * allowance because at 500 words almost any concrete topic needs help.
   */
  newWordBudget: number;
}

export function paramsFor(level: number): LevelParams {
  const l = clampLevel(level);
  return {
    level: l,
    cefr: cefrFor(l),
    vocabBand: vocabSizeFor(l),
    sentenceWords: Math.round(8 + 0.14 * l),
    allowedGrammar: grammarFor(l),
    newWordBudget: 0.1 - 0.05 * (l / 100),
  };
}

// --- Calibration ------------------------------------------------------------

export type SelfRating = "too-easy" | "just-right" | "too-hard";

export interface SessionSignals {
  /** Words the reader tapped for a definition, over total words. */
  lookupRate: number;
  /** Comprehension quiz, 0-1. Undefined if they skipped it. */
  quizScore?: number;
  rating?: SelfRating;
}

/**
 * The target lookup rate. Around one unknown word in twenty is the level at
 * which reading is still fluent but is still teaching something - too far
 * below and the text is wasted practice, too far above and comprehension
 * collapses and the reader gives up.
 */
export const TARGET_LOOKUP_RATE = 0.05;

/** Largest single-session move, so one odd session cannot derail the estimate. */
const MAX_STEP = 8;

function fromLookups(rate: number): number {
  if (rate < 0.02) return 3;
  if (rate < 0.035) return 1.5;
  if (rate <= 0.07) return 0;
  if (rate <= 0.12) return -1.5;
  return -3;
}

function fromQuiz(score: number): number {
  if (score >= 0.9) return 2;
  if (score >= 0.7) return 0;
  if (score >= 0.5) return -1.5;
  return -3;
}

function fromRating(rating: SelfRating): number {
  return rating === "too-easy" ? 4 : rating === "too-hard" ? -4 : 0;
}

/**
 * A staircase controller: nudge the level from three independent signals and
 * let repeated sessions converge. The self-rating carries the most weight
 * because it is a direct answer, but it is deliberately not the only input -
 * learners routinely rate a text "just right" while looking up a third of it.
 */
export function nextLevel(current: number, signals: SessionSignals): number {
  let delta = fromLookups(signals.lookupRate);
  if (signals.quizScore !== undefined) delta += fromQuiz(signals.quizScore);
  if (signals.rating) delta += fromRating(signals.rating);

  const capped = Math.max(-MAX_STEP, Math.min(MAX_STEP, delta));
  return clampLevel(current + capped);
}
