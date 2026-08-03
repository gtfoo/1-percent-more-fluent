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
import type { LevelParams } from "@/lib/level";
import { isProtected, missingTerms, termSpans } from "@/lib/terms";
import { rankOf, registerAnchors } from "./frequency";

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
  /** Word occurrences covered by a declared topic term. */
  termWords: number;
  /** Their share of the text - the guard against a piece that is all jargon. */
  termRate: number;
  /** Declared terms that never appear in the text. */
  missingTerms: string[];
}

/**
 * The most distinct topic terms a piece may claim.
 *
 * Terms are exempt from the difficulty budget, so this is the ceiling on how
 * much of the text can escape measurement. It is also a content judgement: a
 * short piece introducing more than a dozen new domain words is a glossary
 * someone has punctuated, not something a learner can absorb in one sitting.
 */
export const MAX_TERMS = 12;

/**
 * ...and the most of the TEXT they may account for.
 *
 * MAX_TERMS caps distinct terms, not occurrences, so without this a model can
 * satisfy every rule and still hand back a piece that is a quarter jargon by
 * repeating twelve terms relentlessly. Repetition is how terminology sticks, so
 * this sits well above natural usage - it exists to catch padding, not to
 * discourage reuse.
 */
export const MAX_TERM_RATE = 0.25;

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

/**
 * ...and how far BELOW the budget before the text is too easy for its level.
 *
 * This half matters more than it sounds. The vocabulary band only constrains
 * the model at low levels; by level 84 the band is ~11,000 words, so nothing
 * falls outside it and the model just writes its default register. Measured
 * across real generations: 5.2% out-of-band at level 45 against a 7.8% budget,
 * but 1.5% at level 84 and 0.0% at level 96.
 *
 * With only a ceiling, that asymmetry is a runaway. Text stops getting harder
 * as the level climbs, so the reader looks nothing up, the controller reads
 * that as "too easy" and pushes the level higher again - all the way to 100
 * regardless of what they can actually read. A floor closes the loop.
 */
export const BUDGET_FLOOR = 0.4;

/** Sentences may run this much longer than target before we complain. */
const SENTENCE_SLACK = 1.5;

/**
 * The floor only applies once there is enough text for the rate to mean
 * something. On a 55-word paragraph the acceptable window between floor and
 * ceiling is barely one to five words wide, and generation genuinely cannot
 * aim that finely - the graded samples oscillated 0% -> 23% -> 0% across three
 * attempts trying. Real reading pieces start at 180 words, where the same
 * window is 4 to 15 words and comfortably hittable.
 *
 * There is a second reason not to push the floor at short lengths: above B2 a
 * text's difficulty comes as much from grammar as from vocabulary. The C1
 * sample that measured 0% out-of-band was still using the imperfect subjunctive
 * and conditional throughout - genuinely advanced, just not rare-worded.
 */
export const MIN_WORDS_FOR_FLOOR = 120;

/**
 * The best (lowest) frequency rank across a word and its plausible base forms,
 * or null if none of them appear in the corpus at all.
 */
function bestRank(word: string, params: LevelParams): number | null {
  let best: number | null = null;
  const code = params.language.code;
  for (const form of params.language.baseForms(word, (f) => rankOf(f, code) !== null)) {
    const rank = rankOf(form, code);
    if (rank !== null && (best === null || rank < best)) best = rank;
  }
  return best;
}

/**
 * `terms` are the topic terms the piece declared. They are excluded from the
 * difficulty budget - see src/lib/terms.ts for why that is the whole point -
 * but they still count toward the word total, because the reader does read
 * them.
 */
export function measure(
  text: string,
  params: LevelParams,
  terms: string[] = [],
  names: string[] = [],
): DifficultyReport {
  const language = params.language;
  const placed = language.wordsWithOffsets(text);
  const totalWords = placed.length;

  const spans = termSpans(text, terms);
  // Character names are not vocabulary. A learner does not need to "know" that
  // a person in the story is called 王伟 any more than an English reader needs
  // to know "Siobhan", and the frequency list has no useful rank for either -
  // so measured as words they read as maximally rare and push the text over
  // budget on nothing. Observed: a payment conversation failed at 14.5% where
  // the flagged words were the halves of the two speakers' names.
  //
  // Kept separate from terms rather than folded in: these are exempt because
  // they are not vocabulary at all, whereas a term is vocabulary the piece is
  // deliberately teaching. Only terms count toward the term budget.
  const nameSpans = termSpans(text, names);
  const free = placed.filter(
    (w) =>
      !isProtected(spans, w.at, w.length) && !isProtected(nameSpans, w.at, w.length),
  );
  const termWords = placed.filter((w) => isProtected(spans, w.at, w.length)).length;
  const termRate = totalWords ? termWords / totalWords : 0;

  const beyond = new Map<string, number>();
  const seen = new Map<string, number | null>();
  for (const { text: word } of free) {
    if (!seen.has(word)) seen.set(word, bestRank(word, params));
    const rank = seen.get(word)!;
    // Outside the top 50k entirely is treated as maximally rare.
    if (rank === null) beyond.set(word, Infinity);
    else if (rank > params.vocabBand) beyond.set(word, rank);
  }

  const outOfBand = [...beyond.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);

  // Rate is over token occurrences, not distinct words: a rare word repeated
  // eight times is one thing to learn, not eight obstacles. The denominator is
  // still the whole text - the question is what share of what the reader reads
  // is unexplained, and a glossed term is not unexplained.
  const outOfBandTokens = free.filter((w) => beyond.has(w.text)).length;
  const outOfBandRate = totalWords ? outOfBandTokens / totalWords : 0;

  const sentenceLengths = language
    .sentences(text)
    .map((s) => language.words(s).length)
    .filter(Boolean);
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
      `${(outOfBandRate * 100).toFixed(1)}% of words fall outside the ${params.vocabBand.toLocaleString()} most common ${language.name} words (limit ${(budgetCeiling * 100).toFixed(0)}%). Replace these with everyday equivalents: ${outOfBand.slice(0, 25).join(", ")}.`,
    );
  }
  // The other side of the budget: text that never leaves the band teaches the
  // reader nothing, and at higher levels that is the model's default output.
  const budgetFloor = params.newWordBudget * BUDGET_FLOOR;
  if (totalWords >= MIN_WORDS_FOR_FLOOR && outOfBandRate < budgetFloor) {
    // Concrete anchors from just beyond the band. "Be harder" alone does not
    // work - the model has no way to know where the band ends.
    const edge = registerAnchors(params.vocabBand, language.code);
    problems.push(
      `Only ${(outOfBandRate * 100).toFixed(1)}% of words fall outside the ${params.vocabBand.toLocaleString()} most common words, so this is too easy for the level - aim for about ${(params.newWordBudget * 100).toFixed(0)}%. Do not simplify further and do not lengthen it; instead reach for the more precise or vivid word wherever there is a choice. Words at the edge of this reader's range look like this: ${edge.join(", ")}. Use that register - not those exact words unless they fit - and put whatever lands outside the band in the glossary.`,
    );
  }

  const sentenceCeiling = params.sentenceWords * SENTENCE_SLACK;
  if (meanSentenceWords > sentenceCeiling) {
    problems.push(
      `Sentences average ${meanSentenceWords.toFixed(1)} words (target ${params.sentenceWords}). Break them up.`,
    );
  }

  // --- The topic terms themselves ------------------------------------------
  // Declaring a term buys it an exemption from the budget, so the declaration
  // has to be honest. Both checks below are about that bargain.

  const absent = missingTerms(text, terms);
  if (absent.length) {
    problems.push(
      `You listed ${absent.length} key term(s) that never appear in the text: ${absent.join(", ")}. Either use each one in the text - a term the reader never meets teaches them nothing - or drop it from the list.`,
    );
  }

  const distinct = new Set(terms.map((t) => t.trim()).filter(Boolean));
  if (distinct.size > MAX_TERMS) {
    problems.push(
      `${distinct.size} key terms is too many for one piece (limit ${MAX_TERMS}). Keep the ones the topic genuinely cannot be discussed without, and cut the rest.`,
    );
  }

  if (termRate > MAX_TERM_RATE) {
    problems.push(
      `${(termRate * 100).toFixed(0)}% of the text is key terms (limit ${(MAX_TERM_RATE * 100).toFixed(0)}%). Keep the terms, but put more ordinary language around them so the piece reads as prose rather than as a definition list.`,
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
    termWords,
    termRate,
    missingTerms: absent,
  };
}
