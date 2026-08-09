/**
 * What the rest of the app needs to know about a language.
 *
 * Everything here is pure string handling and data, deliberately free of node
 * built-ins, because the reader imports it in the browser to tokenise text for
 * tapping and highlighting. The bulky per-language corpora stay server-side in
 * `src/server/frequency.ts`, keyed by the same `code`.
 *
 * The interface is shaped by the hardest case rather than the easiest. Spanish
 * alone would suggest "a regex for letters and a suffix stripper"; Chinese has
 * no spaces, no inflection, and difficulty driven by characters. So the
 * contract is stated in terms of what the app needs answered, not how a
 * particular language answers it.
 */
import type { UiFormatters, UiStrings } from "../ui-strings";

export interface Token {
  text: string;
  isWord: boolean;
}

/** A word, normalised for lookup, plus where it came from in the raw text. */
export interface PlacedWord {
  /** Normalised, exactly as `words()` would return it. */
  text: string;
  /** Index of the word in the ORIGINAL string, not the normalised one. */
  at: number;
  /** Length in the ORIGINAL string; normalising can change the length. */
  length: number;
}

export interface GrammarGate {
  minLevel: number;
  /** Described in English, because it goes straight into the generation prompt. */
  allows: string;
}

export interface Language {
  /** BCP-47-ish; matches the `language` column on profiles and pieces. */
  code: string;
  /** As written in prompts and UI copy: "Spanish", "Simplified Chinese". */
  name: string;

  /**
   * Split into words and the punctuation between them, preserving everything.
   * Joining `tokens.map(t => t.text)` MUST reproduce the input exactly - the
   * reader relies on that to make each word tappable without altering the
   * prose, and the audio character offsets are derived from it.
   */
  tokenize(text: string): Token[];

  /** Just the word forms, normalised for lookup. */
  words(text: string): string[];

  /**
   * The same words, each with where it sits in the ORIGINAL string.
   *
   * `words()` must be exactly `wordsWithOffsets().map(w => w.text)` - implement
   * one in terms of the other rather than writing the walk twice. The contract
   * test asserts it, because the two drifting apart is silent: `text` is the
   * normalised form used for frequency lookup, while `at`/`length` index the
   * raw string, and difficulty measurement now needs both at once to tell
   * whether a word falls inside a protected topic term.
   */
  wordsWithOffsets(text: string): PlacedWord[];

  /** Split into sentences, on whatever punctuation the language actually uses. */
  sentences(text: string): string[];

  /** The key a word is stored and looked up under. */
  normalizeWord(word: string): string;

  /**
   * How to write this language's pronunciation, or null if it does not need one.
   *
   * Null for Spanish: the spelling already tells you how to say it, so a
   * transcription would be noise. Chinese is the opposite - characters carry no
   * sound at all, and a learner who cannot pronounce 钥匙 cannot say it to
   * anyone, which is the entire point of learning it.
   *
   * `derived` means a library computes it, and the model is never asked. The
   * model got polyphones wrong - it returned "dài é" for 大额, where 大 is dà -
   * and a wrong reading is the one error a learner cannot catch, because it
   * looks exactly like a right one.
   *
   * `via` names WHICH derivation, and exists so a second one cannot arrive
   * silently. The bare tag was enough while only one language derived, because
   * pronounce.ts just called the pinyin function after checking it - so a
   * language setting `derived` without a pinyin implementation would get
   * `undefined` back, with no error and no failing test. That is exactly how the
   * missing pinyin went unnoticed for weeks. With a member here, the switch in
   * pronounce.ts stops compiling until the new one is handled.
   *
   * DELIBERATELY NOT A FUNCTION. These modules are imported by the reader, which
   * is a client component, so anything referenced here ships to the browser -
   * and the pinyin dictionary is 1.1MB. The derivation lives in
   * src/server/pronounce.ts, keyed off this tag.
   */
  pronunciation: null | { source: "derived"; via: "pinyin" };

  /** The interface, written in this language. See src/lib/ui-strings.ts. */
  ui: UiStrings;

  /** Its interpolating strings. Server-only: functions cannot cross to a client. */
  uiFormat: UiFormatters;

  /**
   * The level at which the interface switches to this language.
   *
   * Per language rather than global because the bands are not comparable: HSK 4
   * and B1 sit at different points on the 0-100 scale, and "can read the words
   * on a button" arrives at a different place in a language with no alphabet.
   * The reader can always override it either way.
   */
  uiFromLevel: number;

  /**
   * Every form of `word` worth looking up in the frequency list, including the
   * word itself.
   *
   * This is the load-bearing abstraction. A frequency list holds surface forms,
   * so taken literally an inflection of a common verb reads as a rare word,
   * which both overstates difficulty and pushes the generator into stilted
   * prose. Spanish answers this by stripping inflectional endings; Chinese
   * answers it by decomposing a compound its segmenter produced but the list
   * lacks. Same contract, unrelated implementations.
   *
   * `isKnown` reports whether a candidate form appears in the corpus at all.
   * Splitting a Chinese compound requires consulting a lexicon - greedy
   * longest-match is only meaningful against one - and the language modules
   * deliberately hold no data, so the caller supplies the lookup. Languages
   * that do not need it, like Spanish, ignore it.
   *
   * Implementations should err towards returning MORE candidates: a word
   * wrongly judged known costs the reader one tap, while a word wrongly judged
   * rare distorts every generation.
   */
  baseForms(word: string, isKnown: (form: string) => boolean): string[];

  /** Constructions permitted at each level, cumulative from `minLevel` up. */
  grammar: GrammarGate[];

  /**
   * A sentence of concrete "prefer this, not that" pairs for the prompt.
   * Models overshoot the vocabulary budget by reaching for a literary register
   * rather than genuinely rare words, and naming that failure mode in the
   * language's own vocabulary is what pulls the first attempt into budget.
   */
  registerExamples: string;

  /**
   * The proficiency label learners of THIS language actually use - CEFR for
   * European languages, HSK for Chinese. Never an input to anything; the level
   * scale itself is a plain number.
   */
  levelLabel(vocabSize: number): string;

  /** Reading font stack. CJK needs system fonts; webfonts run to megabytes. */
  fontStack: string;
}
