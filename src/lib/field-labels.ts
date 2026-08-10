/**
 * The eight subject fields, written for a reader rather than for the code.
 *
 * `FIELDS` are internal identifiers - "payments", "philosophy" - chosen to be
 * short and stable. They are fine in a chip's metadata and wrong as the row
 * headings of a grid somebody reads.
 *
 * Kept out of UiStrings on purpose. `Record<Field, string>` is enforced
 * key-by-key by the compiler, so adding a ninth field breaks all four
 * languages at once - the same guarantee UiStrings gives - without adding
 * thirty-two flat keys to an interface that is already long. And UiStrings
 * stays a flat map of plain strings, which is the invariant that keeps it
 * safe to hand to a client component.
 */
import { DEFAULT_LANGUAGE } from "./languages";
import type { Field } from "./suggestions";

const EN: Record<Field, string> = {
  food: "Food",
  payments: "Money",
  language: "Language",
  engineering: "Engineering",
  philosophy: "Ideas",
  sport: "Sport",
  medicine: "Health",
  travel: "Travel",
};

const ES: Record<Field, string> = {
  food: "Comida",
  payments: "Dinero",
  language: "Lengua",
  engineering: "Ingeniería",
  philosophy: "Ideas",
  sport: "Deporte",
  medicine: "Salud",
  travel: "Viajes",
};

const ZH_CN: Record<Field, string> = {
  food: "饮食",
  payments: "金钱",
  language: "语言",
  engineering: "工程",
  philosophy: "思想",
  sport: "体育",
  medicine: "健康",
  travel: "旅行",
};

const ID: Record<Field, string> = {
  food: "Makanan",
  payments: "Uang",
  language: "Bahasa",
  engineering: "Teknik",
  philosophy: "Pemikiran",
  sport: "Olahraga",
  medicine: "Kesehatan",
  travel: "Perjalanan",
};

const BY_LANGUAGE: Record<string, Record<Field, string>> = {
  es: ES,
  "zh-CN": ZH_CN,
  id: ID,
};

/**
 * Field names in the INTERFACE language, which is not always the language
 * being learned - below the switching threshold the chrome is English while
 * the prose is not.
 *
 * Falls back to English rather than throwing, matching getLanguage: an
 * unrecognised code is a mislabelled grid, not a broken page.
 */
export function fieldLabels(uiCode: string, inTarget: boolean): Record<Field, string> {
  if (!inTarget) return EN;
  return BY_LANGUAGE[uiCode] ?? BY_LANGUAGE[DEFAULT_LANGUAGE] ?? EN;
}
