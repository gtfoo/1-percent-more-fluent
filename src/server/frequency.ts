/**
 * The Spanish frequency list, loaded once and indexed by rank.
 *
 * Server-only: the list is ~50k entries and the client never needs it. Built by
 * `npm run wordlist` - see scripts/build-wordlist.ts.
 */
import frequency from "@/data/es/frequency.json";

let ranks: Map<string, number> | null = null;

function index(): Map<string, number> {
  if (ranks) return ranks;
  ranks = new Map();
  const list = frequency.words as string[];
  for (let i = 0; i < list.length; i++) {
    // First occurrence wins, so the map holds the best (lowest) rank.
    if (!ranks.has(list[i]!)) ranks.set(list[i]!, i + 1);
  }
  return ranks;
}

/** 1-based frequency rank, or null if the word is outside the top 50k. */
export function rankOf(word: string): number | null {
  return index().get(word.toLowerCase()) ?? null;
}

/** The most common `n` words - used to show the model what "in band" means. */
export function topWords(n: number): string[] {
  return (frequency.words as string[]).slice(0, n);
}

export const CORPUS_SIZE = (frequency.words as string[]).length;
