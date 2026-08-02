/**
 * The per-language corpora: frequency ranks, placement test items, register
 * anchors and graded samples.
 *
 * Server-only. Each list is ~50k entries and the client never needs one, which
 * is why the language modules in src/lib/languages stay free of data and carry
 * only behaviour.
 *
 * Imports are static rather than dynamic on purpose: the bundler has to be able
 * to see them. Adding a language means adding an entry here and a module there.
 * Built by `npm run wordlist` - see scripts/build-wordlist.ts.
 */
import { DEFAULT_LANGUAGE } from "@/lib/languages";

import esFrequency from "@/data/es/frequency.json";
import esPlacement from "@/data/es/placement.json";
import esAnchors from "@/data/es/anchors.json";
import esSamples from "@/data/es/samples.json";

export interface PlacementBand {
  minRank: number;
  maxRank: number;
  words: string[];
  pseudowords: string[];
}

export interface GradedSample {
  level: number;
  text: string;
}

interface LanguageData {
  words: string[];
  bands: PlacementBand[];
  anchors: { fromRank: number; words: string[] }[];
  samples: GradedSample[];
}

const DATA: Record<string, LanguageData> = {
  es: {
    words: esFrequency.words as string[],
    bands: esPlacement.bands as PlacementBand[],
    anchors: esAnchors.anchors as { fromRank: number; words: string[] }[],
    samples: esSamples.samples as GradedSample[],
  },
};

function dataFor(code: string): LanguageData {
  return DATA[code] ?? DATA[DEFAULT_LANGUAGE]!;
}

/** Rank indexes are built lazily and once - 50k entries per language. */
const indexes = new Map<string, Map<string, number>>();

function index(code: string): Map<string, number> {
  const existing = indexes.get(code);
  if (existing) return existing;

  const ranks = new Map<string, number>();
  const list = dataFor(code).words;
  for (let i = 0; i < list.length; i++) {
    // First occurrence wins, so the map holds the best (lowest) rank.
    if (!ranks.has(list[i]!)) ranks.set(list[i]!, i + 1);
  }
  indexes.set(code, ranks);
  return ranks;
}

/** 1-based frequency rank, or null if the word is outside the corpus. */
export function rankOf(word: string, code: string): number | null {
  return index(code).get(word.toLowerCase()) ?? null;
}

export function placementBands(code: string): PlacementBand[] {
  return dataFor(code).bands;
}

export function gradedSamples(code: string): GradedSample[] {
  return dataFor(code).samples;
}

export function corpusSize(code: string): number {
  return dataFor(code).words.length;
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
 * Pre-vetted at build time against a dictionary. Sampling the raw corpus tail
 * here instead produced "your", "sebastian" and "ningun".
 */
export function registerAnchors(vocabBand: number, code: string): string[] {
  const all = dataFor(code).anchors;
  // The closest edge at or below the band, so the anchors sit just past it.
  const best = all
    .filter((a) => a.fromRank <= vocabBand)
    .sort((a, b) => b.fromRank - a.fromRank)[0];
  return (best ?? all[0])?.words ?? [];
}
