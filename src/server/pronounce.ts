/**
 * How to say a word, computed rather than generated.
 *
 * The model produced pinyin for a while and got polyphones wrong: it returned
 * "dài é" for 大额, where 大 is dà. That is the one class of error a learner
 * cannot catch, because a wrong reading looks exactly like a right one - and
 * the whole reason pinyin is here is that they cannot read the answer off the
 * characters themselves. pinyin-pro resolves readings from a dictionary with
 * word segmentation, so 银行 is yín háng while 行走 is xíng zǒu.
 *
 * SERVER ONLY. The dictionary is 1.1MB and the language modules are imported by
 * the reader, which is a client component - so this deliberately lives outside
 * src/lib/languages and is reached by the `pronunciation.source` tag instead of
 * by a function hanging off the Language object.
 */
import { pinyin } from "pinyin-pro";
import { getLanguage } from "@/lib/languages";

/**
 * Han runs and Latin/digit runs, and nothing else.
 *
 * Feeding raw text straight to pinyin-pro spaces out every character it does
 * not recognise - "AI技术" comes back as "A I jì shù" - and keeps punctuation,
 * so "你好，世界。" becomes "nǐ hǎo ， shì jiè 。". Matching the runs we care
 * about drops the punctuation and keeps Latin words whole.
 */
const RUN = /[一-鿿]+|[A-Za-z0-9]+/g;
const HAN = /[一-鿿]/;

/** Hanyu Pinyin with tone marks, syllable-spaced. Empty if there is no Han. */
export function toPinyin(text: string): string {
  const runs = text.match(RUN);
  if (!runs) return "";
  if (!runs.some((r) => HAN.test(r))) return "";

  return runs
    .map((run) => (HAN.test(run) ? pinyin(run) : run))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The pronunciation for a word in a language, or undefined if it needs none.
 *
 * Undefined rather than an empty string so callers can spread it into an object
 * and simply not set the key.
 */
export function pronounce(code: string, text: string): string | undefined {
  const language = getLanguage(code);
  if (language.pronunciation?.source !== "derived") return undefined;

  // Only Chinese derives today. A second one would branch on `code` here.
  const said = toPinyin(text);
  return said || undefined;
}

/** Does this language compute its own pronunciation, rather than asking? */
export function derivesPronunciation(code: string): boolean {
  return getLanguage(code).pronunciation?.source === "derived";
}
