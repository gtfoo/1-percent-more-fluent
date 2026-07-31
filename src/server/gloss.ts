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
import { normalizeWord } from "@/lib/spanish";

const GlossSchema = z.object({
  lemma: z.string().describe("The dictionary form of the word."),
  partOfSpeech: z.string().describe("Noun, verb, adjective, etc. In English."),
  meaning: z.string().describe("A short English gloss, under 12 words."),
});

/**
 * `lemma` and `partOfSpeech` are optional because entries seeded from a piece's
 * own glossary carry only a meaning - they came free with the text and are not
 * worth a second model call to enrich.
 */
export interface Gloss {
  word: string;
  meaning: string;
  lemma?: string;
  partOfSpeech?: string;
  cached: boolean;
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
  language: string,
  entries: { word: string; meaning: string }[],
): void {
  const stmt = getDb().prepare(
    `INSERT OR IGNORE INTO gloss_cache (language, word, meaning, created_at)
     VALUES (?, ?, ?, ?)`,
  );
  const now = new Date().toISOString();
  for (const entry of entries) {
    const key = normalizeWord(entry.word);
    if (!key || !entry.meaning) continue;
    stmt.run(language, key, JSON.stringify({ meaning: entry.meaning }), now);
  }
}

export async function glossWord(
  word: string,
  sentence: string,
  language = "es",
): Promise<Gloss> {
  const key = normalizeWord(word);
  if (!key) throw new Error("empty word");

  const hit = readCache(language, key);
  if (hit) return hit;

  const { object } = await generateStructured({
    schema: GlossSchema,
    system:
      "You are a bilingual dictionary. Answer with the plain dictionary meaning of the word. Be terse.",
    prompt: [
      `Spanish word: ${key}`,
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
    .run(language, key, JSON.stringify(object), new Date().toISOString());

  return { word: key, cached: false, ...object };
}

/** Record that the reader needed help with a word - the difficulty signal. */
export function recordLookup(userId: string, pieceId: string, word: string): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO lookups (user_id, piece_id, word, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(userId, pieceId, normalizeWord(word), new Date().toISOString());
}

export function countLookups(userId: string, pieceId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM lookups WHERE user_id = ? AND piece_id = ?")
    .get(userId, pieceId) as { n: number };
  return row.n;
}
