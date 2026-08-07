/**
 * Simplified Chinese.
 *
 * The case the Language interface was designed against, and the one that makes
 * the abstraction earn its keep: no whitespace, no inflection, and difficulty
 * driven as much by characters as by words.
 */
import type { GrammarGate, Language, PlacedWord, Token } from "./types";

// Built with `new RegExp` so this file stays plain ASCII where it can.
const HAN = new RegExp("[\\u4e00-\\u9fff]");

/**
 * Word segmentation, built into Node 20 and every current browser.
 *
 * Chinese is written without spaces, so "which characters form a word" is a
 * real decision rather than a matter of splitting on whitespace. Intl.Segmenter
 * carries ICU's dictionary and gets it right without a dependency: it splits
 * the test sentence into exactly the units a reader would recognise.
 */
let segmenter: Intl.Segmenter | null = null;
function segment(text: string): Intl.Segments {
  segmenter ??= new Intl.Segmenter("zh-CN", { granularity: "word" });
  return segmenter.segment(text);
}

/**
 * Every segment is emitted, word-like or not, so joining the tokens reproduces
 * the input exactly. The reader depends on that to make each word tappable and
 * to line audio character offsets up with the text.
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const s of segment(text)) {
    // `isWordLike` is true for Latin words and digits too, so also require a
    // Han character - romanised names and numerals are not vocabulary to test.
    tokens.push({ text: s.segment, isWord: Boolean(s.isWordLike) && HAN.test(s.segment) });
  }
  return tokens;
}

function wordsWithOffsets(text: string): PlacedWord[] {
  const out: PlacedWord[] = [];
  for (const s of segment(text)) {
    // Same test as tokenize, for the same reason.
    if (!(Boolean(s.isWordLike) && HAN.test(s.segment))) continue;
    // Nothing to fold here, so the raw segment IS the lookup form - which is
    // why `at` and `length` describe it exactly.
    out.push({ text: s.segment, at: s.index, length: s.segment.length });
  }
  return out;
}

function words(text: string): string[] {
  return wordsWithOffsets(text).map((w) => w.text);
}

/** No case and no accents to fold; strip anything that is not Han. */
function normalizeWord(word: string): string {
  return [...word].filter((c) => HAN.test(c)).join("");
}

/**
 * Chinese punctuation is its own set of full-width characters, and there are no
 * spaces after them.
 */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[。！？；…])|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Decompose a token the segmenter produced but the frequency list lacks.
 *
 * This is the Chinese answer to the same problem Spanish solves by stripping
 * inflectional endings. The segmenter groups longer units than the frequency
 * list stores - it returns 什么时候 as one token, while the list has 什么 at
 * rank 12 and 时候 at rank 110 - so taken literally an everyday phrase reads as
 * vocabulary beyond the top 50,000.
 *
 * Longest-match from the left, which is the standard greedy segmentation and
 * matches how the list was built. Callers take the best rank across whatever
 * comes back, so returning the parts is enough; they do not need reassembling.
 *
 * NOTE: this is the seam for a character band. Chinese difficulty is really
 * driven by character knowledge - 中文 sits at rank 11,048 yet any beginner
 * reads it, because 中 and 文 are among the commonest characters, while 犹豫 at
 * rank 6,080 is genuinely hard. Adding single characters to the returned forms,
 * weighted by character frequency, is the additive change; nothing else needs
 * to move.
 */
function baseForms(word: string, isKnown: (form: string) => boolean): string[] {
  const forms = new Set<string>([word]);
  if (word.length < 2) return [...forms];

  let i = 0;
  while (i < word.length) {
    let matched = "";
    for (let len = Math.min(4, word.length - i); len >= 1; len--) {
      const candidate = word.slice(i, i + len);
      if (isKnown(candidate)) {
        matched = candidate;
        break;
      }
    }
    if (matched) {
      forms.add(matched);
      i += matched.length;
    } else {
      // Unknown character: keep it so the caller can still rank it, and move on.
      forms.add(word[i]!);
      i += 1;
    }
  }
  return [...forms];
}

// --- Difficulty -------------------------------------------------------------
// Chinese has no conjugation, no gender and no number agreement, so the ladder
// is structural rather than tense-based: which grammatical machinery a sentence
// is allowed to use, not which endings.

const GRAMMAR: GrammarGate[] = [
  { minLevel: 0, allows: "plain SVO sentences; 是 and 有; 不 and 没 for negation; simple 的 possession" },
  { minLevel: 18, allows: "了 for completed actions; 在 for ongoing ones; measure words; 会/能/可以" },
  { minLevel: 32, allows: "过 for past experience; 着 for continuing states; comparison with 比; 因为...所以" },
  { minLevel: 46, allows: "把 sentences; resultative complements (看完, 听懂); 虽然...但是" },
  { minLevel: 60, allows: "被 for the passive; directional complements; 得 for manner; relative clauses with 的" },
  { minLevel: 74, allows: "是...的 for emphasis; 连...都; four-character idioms used sparingly" },
  { minLevel: 88, allows: "written register, classical residue, any construction" },
];

/**
 * HSK rather than CEFR, because that is the vocabulary Chinese learners
 * actually use. Thresholds follow the published HSK 3.0 word counts.
 */
const HSK_THRESHOLDS: { max: number; label: string }[] = [
  { max: 500, label: "HSK 1" },
  { max: 1_300, label: "HSK 2" },
  { max: 2_200, label: "HSK 3" },
  { max: 3_300, label: "HSK 4" },
  { max: 5_500, label: "HSK 5" },
  { max: 11_000, label: "HSK 6" },
  { max: Infinity, label: "HSK 7+" },
];

export const simplifiedChinese: Language = {
  code: "zh-CN",
  name: "Simplified Chinese",
  tokenize,
  words,
  wordsWithOffsets,
  sentences,
  normalizeWord,
  baseForms,
  grammar: GRAMMAR,
  // Characters carry no sound, so without this a learner can read a word and
  // still be unable to say it to anyone - which is most of the point.
  pronunciation: "Hanyu Pinyin with tone marks, spaced by syllable, e.g. yào shi",
  registerExamples:
    '"想" not "欲", "所以" not "故而", "开始" not "着手" - everyday spoken vocabulary over written or classical register',
  levelLabel: (vocabSize) => HSK_THRESHOLDS.find((t) => vocabSize < t.max)!.label,
  // A CJK webfont is several megabytes; system fonts are already on the device.
  fontStack:
    '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif',
};
