/**
 * The placement test: a yes/no vocabulary test.
 *
 * The learner is shown Spanish words sampled from across the frequency range
 * and marks the ones they know. Mixed in are pseudowords - invented forms that
 * obey Spanish spelling but mean nothing. Claiming to know those is the tell
 * for over-claiming, and the correction below subtracts it back out.
 *
 * This design is chosen over asking for a CEFR level for three reasons: most
 * learners genuinely do not know their CEFR level; self-report is
 * systematically biased; and this costs nothing to run, because the word lists
 * are static. It takes about 90 seconds.
 *
 * The method is the standard Yes/No vocabulary test (Meara), with the
 * false-alarm correction h' = (h - f) / (1 - f).
 */
import placement from "@/data/es/placement.json";
import { MAX_VOCAB } from "@/lib/level";

interface Band {
  minRank: number;
  maxRank: number;
  words: string[];
}

const BANDS = placement.bands as Band[];
const PSEUDOWORDS = placement.pseudowords as string[];

/** Ranks 1-50 are excluded from testing, so credit them automatically. */
const ASSUMED_KNOWN = 50;

const WORDS_PER_BAND = 5;
const PSEUDOWORD_ITEMS = 10;

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
  const items = [
    ...BANDS.flatMap((b) => sample(b.words, WORDS_PER_BAND)),
    ...sample(PSEUDOWORDS, PSEUDOWORD_ITEMS),
  ];
  return sample(items, items.length); // shuffle
}

export interface PlacementResult {
  vocabEstimate: number;
  /** Share of pseudowords claimed as known. High values mean low confidence. */
  falseAlarmRate: number;
  /** True when the false-alarm rate is too high to trust the estimate. */
  unreliable: boolean;
  perBand: { minRank: number; maxRank: number; known: number; shown: number }[];
}

const UNRELIABLE_FALSE_ALARM_RATE = 0.5;

/**
 * Score a completed test into an estimated vocabulary size.
 *
 * For each frequency band we take the share of words claimed known, correct it
 * for guessing, and multiply by the width of the band. Summing across bands
 * gives the number of words the learner plausibly knows - which is what the
 * level scale is anchored to.
 */
export function score(shown: string[], known: string[]): PlacementResult {
  const shownSet = new Set(shown.map((w) => w.toLowerCase()));
  const knownSet = new Set(known.map((w) => w.toLowerCase()));
  const pseudoSet = new Set(PSEUDOWORDS);

  const shownPseudo = [...shownSet].filter((w) => pseudoSet.has(w));
  const knownPseudo = shownPseudo.filter((w) => knownSet.has(w));
  const falseAlarmRate = shownPseudo.length
    ? knownPseudo.length / shownPseudo.length
    : 0;

  // A learner who claims every pseudoword tells us nothing about any band, so
  // the correction collapses to zero rather than dividing by zero.
  const correct = (hitRate: number): number => {
    if (falseAlarmRate >= 1) return 0;
    return Math.max(0, (hitRate - falseAlarmRate) / (1 - falseAlarmRate));
  };

  let vocabEstimate = ASSUMED_KNOWN;
  const perBand: PlacementResult["perBand"] = [];

  for (const band of BANDS) {
    const bandShown = band.words.filter((w) => shownSet.has(w));
    if (!bandShown.length) continue;
    const bandKnown = bandShown.filter((w) => knownSet.has(w));

    const width = band.maxRank - band.minRank + 1;
    vocabEstimate += correct(bandKnown.length / bandShown.length) * width;

    perBand.push({
      minRank: band.minRank,
      maxRank: band.maxRank,
      known: bandKnown.length,
      shown: bandShown.length,
    });
  }

  return {
    vocabEstimate: Math.min(Math.round(vocabEstimate), MAX_VOCAB),
    falseAlarmRate,
    unreliable: falseAlarmRate >= UNRELIABLE_FALSE_ALARM_RATE,
    perBand,
  };
}
