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
 *     level 100 -> ~20,000              (educated native reader)
 *
 * and it is geometric, because the step from 1,000 to 2,000 words is roughly
 * the same amount of learning as 10,000 to 20,000.
 *
 * The scale and the controller are language-neutral. Everything that is not -
 * which constructions unlock when, and what the label is called - belongs to
 * the language module.
 */
import { DEFAULT_LANGUAGE, getLanguage, type Language } from "./languages";

export const MIN_VOCAB = 500;
/**
 * Matches the placement test's ceiling (`TEST_MAX_RANK` in build-wordlist.ts).
 * The scale must not extend past what the test can actually measure, or the top
 * of it is unreachable guesswork.
 */
export const MAX_VOCAB = 20_000;
const RANGE = MAX_VOCAB / MIN_VOCAB;

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
 * The proficiency label shown to the learner - CEFR for Spanish, HSK for
 * Chinese. Shown because it is the vocabulary they expect, never an input.
 */
export function labelFor(level: number, language: Language): string {
  return language.levelLabel(vocabSizeFor(level));
}

/**
 * Constructions permitted at this level, cumulative.
 *
 * Gating grammar matters more than vocabulary at the low end: a text built
 * entirely from the top 500 words is still incomprehensible to a beginner if it
 * is written in the imperfect subjunctive. Which constructions, and in what
 * order, is a property of the language - Chinese has no tenses to gate at all.
 */
export function grammarFor(level: number, language: Language): string[] {
  return language.grammar.filter((g) => level >= g.minLevel).map((g) => g.allows);
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
  language: Language;
  /** The proficiency label to show, e.g. "B1" or "HSK 4". */
  label: string;
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

/**
 * `language` is required. It used to default to Spanish, which is the same trap
 * that made every generated piece Spanish regardless of the learner: a caller
 * that forgets it gets a confidently wrong answer instead of a compile error.
 */
export function paramsFor(level: number, language: Language): LevelParams {
  const l = clampLevel(level);
  return {
    level: l,
    language,
    label: labelFor(l, language),
    vocabBand: vocabSizeFor(l),
    sentenceWords: Math.round(8 + 0.14 * l),
    allowedGrammar: grammarFor(l, language),
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
  /**
   * Whether there is any evidence the reader actually read the piece - a quiz
   * answered, a rating given, a word tapped, or plausible time on the page.
   *
   * This exists because zero lookups is ambiguous. Someone who found the text
   * trivial taps nothing; so does someone who opened a wall of incomprehensible
   * Spanish and gave up. Treating both as "too easy" pushed a drowning reader
   * *upwards*, which is how a bad placement estimate went from bad to worse
   * instead of self-correcting.
   */
  engaged: boolean;
  /** Completed sessions so far. Early estimates are allowed to move further. */
  sessionCount?: number;
  /**
   * Whether the piece itself measured EASIER than its own level called for.
   *
   * This is what finally closes the runaway. The generator does not reliably
   * hit the upper half of its vocabulary budget - measured attempts land around
   * 1-3% against a 7% target even when told explicitly to aim higher - and a
   * reader who sails through text that was never at their level has told us
   * nothing about whether they could handle harder material. Without this, an
   * under-shooting generator and an upward-only signal feed each other all the
   * way to level 100.
   *
   * So: an easy piece can still move the level DOWN, but never up.
   */
  pieceUndershot?: boolean;
}

/**
 * The target lookup rate. Around one unknown word in twenty is the level at
 * which reading is still fluent but is still teaching something - too far
 * below and the text is wasted practice, too far above and comprehension
 * collapses and the reader gives up.
 */
export const TARGET_LOOKUP_RATE = 0.05;

/**
 * Largest single-session move once the estimate has settled, so one odd session
 * cannot derail it.
 */
const SETTLED_MAX_STEP = 8;
/** ...but a fresh estimate may be badly wrong, and must be able to escape fast. */
const EARLY_MAX_STEP = 20;
/** Sessions over which the controller tightens from early to settled. */
const SETTLING_SESSIONS = 3;

/**
 * How hard the controller pushes, given how much evidence it has.
 *
 * A placement estimate that lands 50 points off should not take seven flawless
 * sessions to walk back, so the first few sessions are amplified and capped
 * higher. The raw signals only sum to about +/-10, so the gain - not the cap -
 * is what actually does the work early on.
 */
function gainFor(sessionCount: number): number {
  const t = Math.min(sessionCount, SETTLING_SESSIONS) / SETTLING_SESSIONS;
  return 2.2 + (1 - 2.2) * t;
}

function maxStepFor(sessionCount: number): number {
  const t = Math.min(sessionCount, SETTLING_SESSIONS) / SETTLING_SESSIONS;
  return EARLY_MAX_STEP + (SETTLED_MAX_STEP - EARLY_MAX_STEP) * t;
}

function fromLookups(rate: number, engaged: boolean): number {
  // Never read "no lookups" as "too easy" without evidence the piece was read.
  if (rate === 0 && !engaged) return 0;
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
 * Lookups and the quiz are ONE signal, not two.
 *
 * Both answer "did you understand this", and they correlate hard - someone who
 * looked nothing up almost always aces the quiz. Adding them treated a single
 * piece of evidence as two independent ones: together they contributed +5 of a
 * possible +9, which is most of how a level ran away upward. Averaging keeps
 * both inputs without letting agreement between them double the push.
 *
 * The lookup rate is the honest signal but coarse - on a 170-word piece one tap
 * is 0.6%, so its bands are finer than the instrument. The quiz is objective
 * but only three questions. Neither deserves to dominate.
 */
function fromComprehension(signals: SessionSignals): number {
  const lookups = fromLookups(signals.lookupRate, signals.engaged);
  if (signals.quizScore === undefined) return lookups;
  return (lookups + fromQuiz(signals.quizScore)) / 2;
}

/**
 * A staircase controller: nudge the level from comprehension and the reader's
 * own verdict, and let repeated sessions converge.
 */
export function nextLevel(current: number, signals: SessionSignals): number {
  let delta = fromComprehension(signals);

  // "Just right" is the reader explicitly asking not to be moved. It should not
  // silently lose to a lookup rate of zero - which is exactly what happened
  // when a piece rated just-right still pushed the level up nine points.
  if (signals.rating === "just-right") delta *= 0.5;
  if (signals.rating) delta += fromRating(signals.rating);

  // Breezing through text that was too easy for its own level is not evidence
  // the reader should be pushed higher.
  if (signals.pieceUndershot) delta = Math.min(delta, 0);

  const sessions = signals.sessionCount ?? SETTLING_SESSIONS;
  const scaled = delta * gainFor(sessions);
  const limit = maxStepFor(sessions);

  return clampLevel(current + Math.max(-limit, Math.min(limit, scaled)));
}

/**
 * The escape hatch: the reader saying outright that a piece was mispitched.
 *
 * Deliberately a big, immediate jump rather than another nudge - it is used
 * when the estimate is wrong enough that waiting for the controller to converge
 * is not a reasonable ask.
 */
export const OVERRIDE_STEP = 15;

export function overrideLevel(current: number, direction: "easier" | "harder"): number {
  return clampLevel(current + (direction === "harder" ? OVERRIDE_STEP : -OVERRIDE_STEP));
}
