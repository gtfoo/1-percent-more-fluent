/**
 * The placement test: a yes/no vocabulary test.
 *
 * The learner is shown Spanish words sampled from across the frequency range
 * and marks the ones they know. Mixed in are pseudowords - invented forms that
 * obey Spanish spelling but mean nothing. Claiming to know those is the tell
 * for over-claiming, and the correction below subtracts it back out.
 *
 * Chosen over asking for a CEFR level because most learners genuinely do not
 * know theirs, self-report is systematically biased, and this costs nothing to
 * run - the word lists are static. It takes about 90 seconds.
 *
 * The method is the standard Yes/No vocabulary test (Meara), with the
 * false-alarm correction h' = (h - f) / (1 - f), applied PER BAND, plus a
 * monotonicity constraint. Both of those deviations from the textbook version
 * exist for the same reason - see the comments on `score`.
 */
import placement from "@/data/es/placement.json";
import { MAX_VOCAB } from "@/lib/level";

interface Band {
  minRank: number;
  maxRank: number;
  words: string[];
  pseudowords: string[];
}

const BANDS = placement.bands as Band[];

/** Ranks 1-50 are excluded from testing, so credit them automatically. */
const ASSUMED_KNOWN = 50;

const WORDS_PER_BAND = 5;
const PSEUDOWORDS_PER_BAND = 2;

/** Below this many catch trials in a band, its own false-alarm rate is noise. */
const MIN_CATCH_TRIALS = 2;

function sample<T>(items: T[], n: number): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, n);
}

/**
 * Build a test. Only the words are returned - never which are real - so the
 * page cannot accidentally reveal the answer key. Scoring re-derives
 * membership server-side from the same data file.
 */
export function buildTest(): string[] {
  const items = BANDS.flatMap((band) => [
    ...sample(band.words, WORDS_PER_BAND),
    ...sample(band.pseudowords, PSEUDOWORDS_PER_BAND),
  ]);
  return sample(items, items.length); // shuffle
}

export interface PlacementResult {
  vocabEstimate: number;
  /** Share of pseudowords claimed as known, across all bands. */
  falseAlarmRate: number;
  /** True when the false-alarm rate is too high to trust the estimate. */
  unreliable: boolean;
  perBand: {
    minRank: number;
    maxRank: number;
    known: number;
    shown: number;
    /** After this band's own false-alarm correction and the monotonic cap. */
    credited: number;
  }[];
}

const UNRELIABLE_FALSE_ALARM_RATE = 0.5;

/**
 * Score a completed test into an estimated vocabulary size.
 *
 * For each frequency band we take the share of words claimed known, correct it
 * for guessing, and multiply by the width of the band. Two things stop that sum
 * from running away, both learned from it running away badly:
 *
 * 1. THE CORRECTION IS PER BAND. Rare Spanish words are disproportionately
 *    Latinate and therefore more transparent to an English speaker, not less.
 *    A single pooled false-alarm rate measured on ordinary mid-frequency words
 *    cannot see that, so the rare bands - which carry the most weight - were
 *    inflated by pure cognate recognition. Each band now brings its own catch
 *    trials and is corrected against them.
 *
 * 2. CREDIT IS MONOTONIC. Vocabulary knowledge cannot increase as words get
 *    rarer, so a band is credited at no more than the running minimum of the
 *    bands below it. Without this, a handful of lucky hits in the widest band
 *    outvoted every band beneath it - one extra "yes" in a 9,000-word band is
 *    worth 1,800 words. The cap is deliberately conservative: it can only ever
 *    lower an estimate, which is the correct direction to err for a tool whose
 *    failure mode was telling a B1 learner they were C2.
 */
export function score(shown: string[], known: string[]): PlacementResult {
  const shownSet = new Set(shown.map((w) => w.toLowerCase()));
  const knownSet = new Set(known.map((w) => w.toLowerCase()));

  // First pass: per-band tallies, and the pooled false-alarm rate used as a
  // fallback wherever a band has too few catch trials to speak for itself.
  const tallies = BANDS.map((band) => {
    const realShown = band.words.filter((w) => shownSet.has(w));
    const pseudoShown = band.pseudowords.filter((w) => shownSet.has(w));
    return {
      band,
      realShown,
      realKnown: realShown.filter((w) => knownSet.has(w)),
      pseudoShown,
      pseudoKnown: pseudoShown.filter((w) => knownSet.has(w)),
    };
  });

  const pooledShown = tallies.reduce((n, t) => n + t.pseudoShown.length, 0);
  const pooledKnown = tallies.reduce((n, t) => n + t.pseudoKnown.length, 0);
  const falseAlarmRate = pooledShown ? pooledKnown / pooledShown : 0;

  let vocabEstimate = ASSUMED_KNOWN;
  let ceiling = 1;
  const perBand: PlacementResult["perBand"] = [];

  for (const t of tallies) {
    if (!t.realShown.length) continue;

    const f =
      t.pseudoShown.length >= MIN_CATCH_TRIALS
        ? t.pseudoKnown.length / t.pseudoShown.length
        : falseAlarmRate;

    const h = t.realKnown.length / t.realShown.length;
    // A learner who claims every pseudoword in a band tells us nothing about
    // that band, so the correction collapses to zero rather than dividing by 0.
    const corrected = f >= 1 ? 0 : Math.max(0, (h - f) / (1 - f));

    ceiling = Math.min(ceiling, corrected);

    const width = t.band.maxRank - t.band.minRank + 1;
    vocabEstimate += ceiling * width;

    perBand.push({
      minRank: t.band.minRank,
      maxRank: t.band.maxRank,
      known: t.realKnown.length,
      shown: t.realShown.length,
      credited: ceiling,
    });
  }

  return {
    vocabEstimate: Math.min(Math.round(vocabEstimate), MAX_VOCAB),
    falseAlarmRate,
    unreliable: falseAlarmRate >= UNRELIABLE_FALSE_ALARM_RATE,
    perBand,
  };
}
