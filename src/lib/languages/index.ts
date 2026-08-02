/**
 * The language registry.
 *
 * Adding a language should be adding one module here and one data entry in
 * src/server/frequency.ts - not editing the generator, the reader, the
 * difficulty checker and the placement test.
 */
import type { Language } from "./types";
import { spanish } from "./es";
import { simplifiedChinese } from "./zh-CN";

export type { Language, Token, GrammarGate } from "./types";

export const LANGUAGES: Record<string, Language> = {
  [spanish.code]: spanish,
  [simplifiedChinese.code]: simplifiedChinese,
};

export const DEFAULT_LANGUAGE = spanish.code;

/**
 * Resolve a language code, falling back to the default.
 *
 * Deliberately forgiving rather than throwing: a `language` value reaches this
 * from the database, from a URL, and from rows written before a code existed,
 * and none of those are worth a 500. An unknown code is a mispitched piece, not
 * a broken app.
 */
export function getLanguage(code: string | null | undefined): Language {
  return (code && LANGUAGES[code]) || LANGUAGES[DEFAULT_LANGUAGE]!;
}

export function languageCodes(): string[] {
  return Object.keys(LANGUAGES);
}
