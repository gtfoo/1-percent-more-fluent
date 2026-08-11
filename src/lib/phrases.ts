/**
 * Phrases the reader built out of more than one token, and where they occur.
 *
 * The segmenter decides where words end, and for a learner it is often wrong:
 * it splits a compound they wanted whole, or joins two they wanted apart. The
 * reader overrules it with the arrow controls - 我, then extend right, gives
 * 我们. That overrule used to last exactly one lookup, because the gloss cache
 * is keyed by TEXT: "我们" matched neither 我 nor 们 when each token asked
 * whether it had been looked up, so nothing was underlined and tapping either
 * half started a fresh one-character selection. The compound had to be
 * rebuilt every time it appeared.
 *
 * Kept out of Reader.tsx because it is the sort of thing that goes subtly wrong
 * - overlapping phrases, block boundaries, a phrase whose tail runs off the end
 * of the piece - and none of that is observable by looking at the component.
 */

/**
 * A phrase as a SHAPE rather than a location: the normalised text, and how many
 * word tokens it spans.
 *
 * Shape rather than range so one lookup joins every occurrence, the way a
 * single-word lookup already does. Build 我们 once and it reads as one unit
 * wherever it appears.
 */
export interface PhraseShape {
  key: string;
  length: number;
}

export interface Span {
  start: number;
  end: number;
}

/**
 * Every word index that falls inside a phrase, mapped to that phrase's range.
 *
 * `keyOf(start, end)` returns the normalised text of that run of words, and is
 * the caller's business because normalisation is per-language and topic terms
 * short-circuit it.
 *
 * Longest first: a reader who has built both 我们 and 我们的 means the longer
 * one when both match, not whichever they happened to look up first. Matches do
 * not overlap - once a word belongs to a phrase, a later phrase cannot claim
 * it - so the result is a partition rather than a pile.
 */
export function phraseSpans(
  words: { block: number }[],
  keyOf: (start: number, end: number) => string,
  phrases: PhraseShape[],
): Map<number, Span> {
  const found = new Map<number, Span>();
  if (phrases.length === 0) return found;

  const longestFirst = [...phrases]
    .filter((p) => p.length > 1)
    .sort((a, b) => b.length - a.length);

  for (let i = 0; i < words.length; i++) {
    if (found.has(i)) continue;
    for (const phrase of longestFirst) {
      const end = i + phrase.length - 1;
      // Runs off the end of the piece.
      if (end >= words.length) continue;
      // Straddles a paragraph or a speaker's turn. `extend` refuses to build
      // one of these, so recognising one later would be inventing a phrase the
      // reader could not have made.
      if (words[end]!.block !== words[i]!.block) continue;
      if (keyOf(i, end) !== phrase.key) continue;
      for (let w = i; w <= end; w++) found.set(w, { start: i, end });
      break;
    }
  }
  return found;
}

/** Add a shape if it is new, keeping the list stable when it is not. */
export function withPhrase(
  phrases: PhraseShape[],
  key: string,
  length: number,
): PhraseShape[] {
  if (length < 2) return phrases;
  return phrases.some((p) => p.key === key && p.length === length)
    ? phrases
    : [...phrases, { key, length }];
}
