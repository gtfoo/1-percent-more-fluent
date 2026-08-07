/**
 * Word lookups for the reader.
 *
 * Most taps are answered from the piece's own glossary, which the generator
 * produced for free alongside the text. This file handles the rest: a word the
 * generator did not think to gloss, looked up on demand and then cached
 * globally, so the same word is never paid for twice.
 *
 * The gloss is context-free - "corriendo" gets the same entry wherever it
 * appears. That is a deliberate trade for the cache hit rate. Context-sensitive
 * glosses would be better for idioms and would be the natural next step.
 */
import { z } from "zod";
import { generateStructured } from "./llm";
import { getDb } from "./db";
import { getLanguage, type Language } from "@/lib/languages";
import { pronounce } from "./pronounce";

/**
 * Built per language, so a language that needs no transcription is never asked
 * for one. Spanish spelling already says how to say it; Chinese characters say
 * nothing at all.
 */
const BASE = {
  lemma: z.string().describe("The dictionary form of the word."),
  partOfSpeech: z.string().describe("Noun, verb, adjective, etc. In English."),
  meaning: z.string().describe("A short English gloss, under 12 words."),
};

// One schema. The model is never asked for a pronunciation - a language that
// needs one derives it locally, where polyphones resolve from a dictionary.
const PLAIN = z.object(BASE);

/**
 * `lemma` and `partOfSpeech` are optional because entries seeded from a piece's
 * own glossary carry only a meaning - they came free with the text and are not
 * worth a second model call to enrich. `pronunciation` is optional because most
 * languages do not need one.
 */
export interface Gloss {
  word: string;
  meaning: string;
  lemma?: string;
  partOfSpeech?: string;
  pronunciation?: string;
  cached: boolean;
}

/**
 * The key a lookup is cached under.
 *
 * `normalizeWord` assumes a single word - it strips everything outside the
 * language's alphabet, which mangles a phrase like "tipo de cambio" into
 * something that will never be found again. Selections can span several words
 * now, so a phrase is keyed on its own collapsed, lowercased text instead.
 */
function cacheKey(language: Language, text: string): string {
  const trimmed = text.trim();
  if (language.words(trimmed).length > 1) {
    return trimmed.toLowerCase().replace(/\s+/g, " ");
  }
  return language.normalizeWord(trimmed);
}

function readCache(language: string, word: string): Gloss | null {
  const row = getDb()
    .prepare("SELECT meaning FROM gloss_cache WHERE language = ? AND word = ?")
    .get(language, word) as { meaning: string } | undefined;
  if (!row) return null;
  return {
    word,
    cached: true,
    ...(JSON.parse(row.meaning) as Omit<Gloss, "word" | "cached">),
  };
}

/**
 * Pre-load the cache with the glossary the generator produced alongside the
 * text. Those definitions were already paid for as part of the generation, so
 * tapping one of those words later should cost nothing. Existing entries win -
 * a real dictionary lookup is richer than a one-line story gloss.
 */
export function seedGlossary(
  code: string,
  entries: { word: string; meaning: string; pronunciation?: string }[],
): void {
  const language = getLanguage(code);
  const stmt = getDb().prepare(
    `INSERT OR IGNORE INTO gloss_cache (language, word, meaning, created_at)
     VALUES (?, ?, ?, ?)`,
  );
  const now = new Date().toISOString();
  for (const entry of entries) {
    const key = cacheKey(language, entry.word);
    if (!key || !entry.meaning) continue;
    // Carried through rather than dropped: these seeded entries answer most
    // taps, so a pronunciation that stops here is one the reader almost never
    // sees - only the rarer words that miss the cache would have shown it.
    stmt.run(
      language.code,
      key,
      JSON.stringify({
        meaning: entry.meaning,
        ...(entry.pronunciation ? { pronunciation: entry.pronunciation } : {}),
      }),
      now,
    );
  }
}

export async function glossWord(
  word: string,
  sentence: string,
  code: string,
): Promise<Gloss> {
  const language = getLanguage(code);
  const key = cacheKey(language, word);
  if (!key) throw new Error("empty word");

  const hit = readCache(language.code, key);
  if (hit) return hit;

  const { object } = await generateStructured({
    schema: PLAIN,
    system:
      "You are a bilingual dictionary. Answer with the plain dictionary meaning of the word or phrase. Be terse.",
    prompt: [
      `${language.name}: ${key}`,
      // The sentence disambiguates homographs even though we cache the result
      // context-free; it costs nothing to pass and improves the common case.
      `It appeared in this sentence: ${sentence}`,
      "Give its dictionary form, part of speech, and a short English meaning.",
    ].join("\n"),
    temperature: 0,
  });

  getDb()
    .prepare(
      `INSERT OR REPLACE INTO gloss_cache (language, word, meaning, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      language.code,
      key,
      // Derived from the word itself, not from the model's answer, and cached
      // alongside it so the next tap costs nothing either.
      JSON.stringify({ ...object, ...withDerived(language.code, word) }),
      new Date().toISOString(),
    );

  return { word: key, cached: false, ...object, ...withDerived(language.code, word) };
}

/** `{ pronunciation }` when the language computes it, `{}` otherwise. */
function withDerived(code: string, text: string): { pronunciation?: string } {
  const said = pronounce(code, text);
  return said ? { pronunciation: said } : {};
}

/** Record that the reader needed help with a word - the difficulty signal. */
export function recordLookup(
  userId: string,
  pieceId: string,
  word: string,
  code: string,
): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO lookups (user_id, piece_id, word, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      userId,
      pieceId,
      getLanguage(code).normalizeWord(word),
      new Date().toISOString(),
    );
}

export function countLookups(userId: string, pieceId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM lookups WHERE user_id = ? AND piece_id = ?")
    .get(userId, pieceId) as { n: number };
  return row.n;
}
