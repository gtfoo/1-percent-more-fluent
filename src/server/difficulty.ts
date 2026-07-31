/**
 * Measure how hard a piece of generated text actually is.
 *
 * This is the check that turns difficulty from a vibe into a number. Language
 * models are unreliable at hitting an abstract target like "B1" but quite good
 * at following concrete constraints - so we ask for concrete constraints and
 * then verify them here, before spending anything on audio.
 *
 * The frequency list holds word FORMS, so a word is checked against every
 * plausible base form (see morphology.ts) before being called rare. Without
 * that, ordinary conjugations like "camina" and "prefiere" get flagged, which
 * both overstates difficulty and pushes the generator into stilted Spanish.
 */
import { sentences, words } from "@/lib/spanish";
import type { LevelParams } from "@/lib/level";
import { rankOf } from "./frequency";
import { baseForms } from "./morphology";

export interface DifficultyReport {
  totalWords: number;
  /** Distinct words beyond the level's vocabulary band, most obscure first. */
  outOfBand: string[];
  outOfBandRate: number;
  meanSentenceWords: number;
  longestSentenceWords: number;
  passes: boolean;
  /** Human-readable failures, fed back to the model on a retry. */
  problems: string[];
}

/**
 * How far past the budget we tolerate before regenerating.
 *
 * Measured: models reliably land 12-15% out-of-band on the first attempt, and
 * reliably drop to 6-8% when handed the specific offending words. At 2x the
 * budget that first attempt sailed through, which put roughly one unknown word
 * in seven in front of the reader - well past the ~5% that keeps reading
 * fluent. 1.5x costs a second call on some generations and is worth it.
 */
export const BUDGET_SLACK = 1.5;
/** Sentences may run this much longer than target before we complain. */
const SENTENCE_SLACK = 1.5;

/**
 * The best (lowest) frequency rank across a word and its plausible base forms,
 * or null if none of them appear in the corpus at all.
 */
function bestRank(word: string): number | null {
  let best: number | null = null;
  for (const form of baseForms(word)) {
    const rank = rankOf(form);
    if (rank !== null && (best === null || rank < best)) best = rank;
  }
  return best;
}

export function measure(text: string, params: LevelParams): DifficultyReport {
  const all = words(text);
  const totalWords = all.length;

  const beyond = new Map<string, number>();
  const seen = new Map<string, number | null>();
  for (const word of all) {
    if (!seen.has(word)) seen.set(word, bestRank(word));
    const rank = seen.get(word)!;
    // Outside the top 50k entirely is treated as maximally rare.
    if (rank === null) beyond.set(word, Infinity);
    else if (rank > params.vocabBand) beyond.set(word, rank);
  }

  const outOfBand = [...beyond.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);

  // Rate is over token occurrences, not distinct words: a rare word repeated
  // eight times is one thing to learn, not eight obstacles.
  const outOfBandTokens = all.filter((w) => beyond.has(w)).length;
  const outOfBandRate = totalWords ? outOfBandTokens / totalWords : 0;

  const sentenceLengths = sentences(text).map((s) => words(s).length).filter(Boolean);
  const meanSentenceWords = sentenceLengths.length
    ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
    : 0;
  const longestSentenceWords = sentenceLengths.length
    ? Math.max(...sentenceLengths)
    : 0;

  const problems: string[] = [];
  const budgetCeiling = params.newWordBudget * BUDGET_SLACK;
  if (outOfBandRate > budgetCeiling) {
    problems.push(
      `${(outOfBandRate * 100).toFixed(1)}% of words fall outside the ${params.vocabBand.toLocaleString()} most common Spanish words (limit ${(budgetCeiling * 100).toFixed(0)}%). Replace these with everyday equivalents: ${outOfBand.slice(0, 25).join(", ")}.`,
    );
  }
  const sentenceCeiling = params.sentenceWords * SENTENCE_SLACK;
  if (meanSentenceWords > sentenceCeiling) {
    problems.push(
      `Sentences average ${meanSentenceWords.toFixed(1)} words (target ${params.sentenceWords}). Break them up.`,
    );
  }

  return {
    totalWords,
    outOfBand,
    outOfBandRate,
    meanSentenceWords,
    longestSentenceWords,
    passes: problems.length === 0,
    problems,
  };
}
