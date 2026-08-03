/**
 * Topic terms: the words a piece is deliberately ABOUT.
 *
 * The problem this solves. Difficulty is measured as "share of words outside
 * the learner's frequency band", and that measure has no idea what the text is
 * for. Ask for a conversation about stablecoins and every word that makes it a
 * conversation about stablecoins - 稳定币, 跨境支付, 汇率 - is rare by general
 * frequency, so the verifier flags them and the retry tells the model to
 * "replace these with everyday equivalents". The loop is a machine for deleting
 * exactly what the learner wanted to learn, and it works as designed.
 *
 * So the model declares the terms up front and they stop counting as
 * difficulty violations. General prose still has to sit at the learner's level;
 * the terminology arrives at full strength with a gloss attached. That is how
 * professional language learning actually works - you are a beginner in the
 * language and fluent in the subject.
 *
 * Matching is by CHARACTER SPAN over the raw text, not by token equality, and
 * that is the whole trick. `Intl.Segmenter` splits 稳定币 into 稳定 + 币, so a
 * token-equality check would miss it and protect nothing. Spans also handle
 * multi-word terms - "tipo de cambio" is three Spanish tokens - without either
 * language needing to know that phrases exist.
 */

import type { Token } from "./languages/types";

export interface TopicTerm {
  /** As it appears in the text, in the target language. */
  term: string;
  /** A short English gloss, shown when the reader taps it. */
  meaning: string;
}

export interface Span {
  start: number;
  /** Exclusive. */
  end: number;
}

/**
 * Every occurrence of every term, merged into sorted non-overlapping spans.
 *
 * Case-insensitive, which matters for Spanish where a term can open a sentence.
 * Lowercasing can in principle change a string's length (Turkish dotted I), but
 * not in any script here, and the spans index the ORIGINAL text either way.
 */
export function termSpans(text: string, terms: string[]): Span[] {
  const haystack = text.toLowerCase();
  const found: Span[] = [];

  for (const raw of terms) {
    const needle = raw.trim().toLowerCase();
    if (!needle) continue;
    // A term that lowercases to a different length would misplace every span
    // after it; skip rather than corrupt the measurement.
    if (needle.length !== raw.trim().length) continue;

    let from = 0;
    for (;;) {
      const at = haystack.indexOf(needle, from);
      if (at === -1) break;
      found.push({ start: at, end: at + needle.length });
      // Overlapping occurrences of the same term are not interesting, and
      // advancing by one would make a term like "aa" quadratic on "aaaa".
      from = at + needle.length;
    }
  }

  if (found.length < 2) return found;

  found.sort((a, b) => a.start - b.start);
  const merged: Span[] = [found[0]!];
  for (const span of found.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push(span);
  }
  return merged;
}

/**
 * Does a word sit inside a protected term?
 *
 * Overlap rather than containment, deliberately. Segmentation does not have to
 * agree with the term's boundaries - a segmenter may produce a token that
 * straddles the edge of a term - and under-protecting is the failure that
 * brings back the original bug.
 */
export function isProtected(spans: Span[], at: number, length: number): boolean {
  const end = at + length;
  for (const span of spans) {
    if (span.start >= end) return false; // sorted: nothing later can overlap
    if (span.end > at) return true;
  }
  return false;
}

/**
 * Re-join tokens that a term straddles, so a term is ONE tappable unit.
 *
 * Without this the reader's segmenter wins and 稳定币 renders as two chips,
 * 稳定 and 币, each glossing separately - which is exactly the wrong lesson,
 * since the compound is the thing being taught. Merging only ever joins
 * ADJACENT tokens, so concatenating the result still reproduces the input and
 * the audio character offsets are untouched.
 */
export function mergeTermTokens(tokens: Token[], spans: Span[]): Token[] {
  if (!spans.length) return tokens;

  const out: Token[] = [];
  let at = 0;
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i]!;
    const span = spans.find((s) => s.end > at && s.start < at + token.text.length);

    if (!span) {
      out.push(token);
      at += token.text.length;
      i++;
      continue;
    }

    // Swallow whole tokens until past the end of the term. A token may extend
    // beyond it; that is fine, the merged unit simply covers a little more.
    let text = "";
    while (i < tokens.length && at < span.end) {
      text += tokens[i]!.text;
      at += tokens[i]!.text.length;
      i++;
    }
    out.push({ text, isWord: true });
  }

  return out;
}

/** Terms the model declared but never actually used. */
export function missingTerms(text: string, terms: string[]): string[] {
  const haystack = text.toLowerCase();
  return terms.filter((t) => t.trim() && !haystack.includes(t.trim().toLowerCase()));
}
