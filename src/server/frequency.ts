/**
 * The Spanish frequency list, loaded once and indexed by rank.
 *
 * Server-only: the list is ~50k entries and the client never needs it. Built by
 * `npm run wordlist` - see scripts/build-wordlist.ts.
 */
import frequency from "@/data/es/frequency.json";
import anchorData from "@/data/es/anchors.json";

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

/**
 * Words from just beyond `vocabBand`, to show the model what the edge of a
 * reader's range sounds like.
 *
 * Telling a model "this is too easy, be harder" does not work: it has no way to
 * know where the band ends, and measured retries came back just as easy. The
 * ceiling correction works because it names the offending words, so the floor
 * correction needs concrete examples too. They calibrate register, not content
 * - the specific words rarely suit the topic.
 *
 * Pre-vetted at build time against the dictionary. Sampling the raw corpus tail
 * here instead produced "your", "sebastian" and "ningun".
 */
export function registerAnchors(vocabBand: number): string[] {
  const all = anchorData.anchors as { fromRank: number; words: string[] }[];
  // The closest edge at or below the band, so the anchors sit just past it.
  const best = all
    .filter((a) => a.fromRank <= vocabBand)
    .sort((a, b) => b.fromRank - a.fromRank)[0];
  return (best ?? all[0])?.words ?? [];
}

export const CORPUS_SIZE = (frequency.words as string[]).length;
