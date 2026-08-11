/**
 * Build the per-language word data the app needs, from hermitdave/FrequencyWords
 * (OpenSubtitles 2018 counts, MIT-licensed).
 *
 *   npm run wordlist                 # Spanish
 *   LANGUAGE=zh-CN npm run wordlist  # Simplified Chinese
 *
 * Produces three files under src/data/<code>/:
 *
 *   frequency.json  - the ranked word list. Index 0 is the most common word.
 *                     This is the ruler everything else measures against: the
 *                     level model expresses difficulty as "the top N of this
 *                     list", and the verifier checks generated text against it.
 *
 *   placement.json  - the yes/no vocabulary test: real words sampled from each
 *                     frequency band, plus per-band pseudowords used as catch
 *                     trials to correct for over-claiming.
 *
 *   anchors.json    - dictionary-vetted words just past a set of band edges,
 *                     shown to the model when a generation comes out too easy.
 *
 * The interesting per-language differences are all in STRATEGIES below. Two of
 * them genuinely cannot be shared:
 *
 *  - VETTING. Spanish has a 636k-form open dictionary to check candidates
 *    against; for Chinese there is no equally reachable one, so a single
 *    build-time model call vets the sampled items instead. Cheap, run once.
 *
 *  - PSEUDOWORDS. Substituting a vowel is meaningless without an alphabet. The
 *    Chinese analogue is a compound of two real characters that is not a real
 *    word - and it happens to catch the exact over-claim that matters there:
 *    "I know both characters, so I must know the word."
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { generateStructured } from "../src/server/llm";
import { getLanguage } from "../src/lib/languages";

function loadEnv(path = ".env.local") {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
    }
  } catch {
    /* ambient env */
  }
}
loadEnv();

// --- Shared shape -----------------------------------------------------------

interface Ranked {
  word: string;
  rank: number;
}

interface Strategy {
  code: string;
  name: string;
  frequencyUrl: string;
  /** Corpus entries that are not plausible words at all. */
  isValidWord(word: string): boolean;
  /** Prepare anything the later steps need (a dictionary, say). */
  prepare(): Promise<void>;
  /** Words worth putting in front of a learner as a test item. */
  isTestable(word: string): boolean;
  /** Final vetting of sampled items; may drop proper nouns and junk. */
  vetItems(words: string[]): Promise<Set<string>>;
  /**
   * Candidate non-words built from this pool, for catch trials. Synchronous and
   * over-generous: everything is vetted together afterwards, in one pass, so
   * that a language needing a model call makes one rather than one per band.
   */
  makePseudowordCandidates(
    donors: Ranked[],
    corpus: Set<string>,
    count: number,
    seen: Set<string>,
  ): string[];
  /** Drop any candidate that turns out to be a real word. */
  vetPseudowords(candidates: string[]): Promise<Set<string>>;
}

/** Band edges. Geometric: knowledge falls off geometrically with rank. */
const BANDS = [120, 300, 700, 1_500, 3_000, 6_000, 11_000, 20_000];
const TEST_MAX_RANK = BANDS[BANDS.length - 1]!;

const WORDS_PER_BAND = 8; // the test samples 5 of these at runtime
const PSEUDOWORDS_PER_BAND = 5; // ...and 2 of these
const ANCHOR_EDGES = [500, 1_000, 2_000, 3_000, 5_000, 8_000, 12_000, 20_000];
const ANCHOR_WORDS = 18;

/** Deterministic pick so the data files are stable across rebuilds. */
function evenlySpaced<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]!);
}

async function fetchText(url: string, label: string): Promise<string> {
  console.log(`Fetching ${label} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} download failed: ${res.status}`);
  return res.text();
}

// --- Spanish ----------------------------------------------------------------

const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");
const DECOMPOSED_N_TILDE = new RegExp("n\\u0303", "g");
const SPANISH_WORD = new RegExp(
  "^[a-z\\u00e1\\u00e9\\u00ed\\u00f3\\u00fa\\u00fc\\u00f1]+$",
);
const LOANWORD_LETTERS = /[kw]/;
const VOWELS = ["a", "e", "i", "o", "u"];

/** Strip accents but keep n-tilde: a distinct letter, and the dictionary has it. */
function fold(word: string): string {
  return word
    .normalize("NFD")
    .replace(DECOMPOSED_N_TILDE, "ñ")
    .replace(COMBINING_MARKS, "");
}

let spanishDictionary = new Set<string>();

const spanish: Strategy = {
  code: "es",
  name: "Spanish",
  frequencyUrl:
    "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt",

  isValidWord: (word) => SPANISH_WORD.test(word),

  async prepare() {
    // A ~636k-form dictionary. The frequency corpus is subtitles, so it is full
    // of proper nouns ("mary", "john") that look like ordinary mid-frequency
    // vocabulary but test nothing.
    const raw = await fetchText(
      "https://raw.githubusercontent.com/words/an-array-of-spanish-words/master/index.json",
      "Spanish dictionary",
    );
    spanishDictionary = new Set(
      (JSON.parse(raw) as string[]).map((w) => w.toLowerCase()),
    );
    console.log(`  ${spanishDictionary.size.toLocaleString()} dictionary forms.`);
  },

  isTestable: (word) =>
    word.length >= 3 &&
    word.length <= 14 &&
    !LOANWORD_LETTERS.test(word) &&
    spanishDictionary.has(fold(word)),

  // Already dictionary-vetted by isTestable; nothing further to do.
  vetItems: async (words) => new Set(words),

  makePseudowordCandidates(donors, corpus, count, seen) {
    const out: string[] = [];
    for (const donor of evenlySpaced(donors, count * 8)) {
      if (out.length >= count) break;
      const fake = substituteVowel(donor.word, corpus);
      if (fake && !seen.has(fake)) {
        seen.add(fake);
        out.push(fake);
      }
    }
    return out;
  },

  // Already checked against a 636k-form dictionary during generation.
  vetPseudowords: async (candidates) => new Set(candidates),
};

/**
 * Turn a real word into a plausible non-word by swapping one interior vowel.
 * Vowel substitution preserves Spanish syllable structure, so the result still
 * looks and sounds Spanish - which is the point.
 */
function substituteVowel(word: string, corpus: Set<string>): string | null {
  for (let i = 1; i < word.length - 1; i++) {
    if (!VOWELS.includes(word[i]!)) continue;
    for (const v of VOWELS) {
      if (v === word[i]) continue;
      const candidate = word.slice(0, i) + v + word.slice(i + 1);
      if (corpus.has(candidate)) continue;
      if (spanishDictionary.has(fold(candidate))) continue;
      return candidate;
    }
  }
  return null;
}

// --- Simplified Chinese -----------------------------------------------------

const HAN = new RegExp("^[\\u4e00-\\u9fff]+$");

const chinese: Strategy = {
  code: "zh-CN",
  name: "Simplified Chinese",
  frequencyUrl:
    "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/zh_cn/zh_cn_50k.txt",

  // The list is already word-segmented, so entries are words, not characters.
  isValidWord: (word) => HAN.test(word),

  async prepare() {},

  /**
   * Two characters is the sweet spot. Single characters make poor test items -
   * the commonest are grammatical particles, and a learner "knowing" one says
   * little - while four or more are usually set phrases or names.
   */
  isTestable: (word) => word.length >= 2 && word.length <= 3,

  vetItems: (words) =>
    vetWithModel(
      words,
      "Simplified Chinese",
      "Mark a word to DROP if it is: a personal name, a place name, a brand, a transliteration of a foreign name; written with any Traditional character rather than Simplified; a multi-word phrase or sentence fragment rather than a single word.",
    ),

  /**
   * Swap ONE character of a real two-character word for a character taken from
   * another real word.
   *
   * This mirrors the Spanish approach - minimally mutate something real - and
   * matters for the same reason. Pairing arbitrary characters produced things
   * like the obviously-fake compounds, because it kept reaching for grammatical
   * particles; keeping the donor's first character means the result still looks
   * like a compound somebody might have coined.
   *
   * It also catches the over-claim that actually matters in Chinese: "I
   * recognise both characters, so I must know the word" - the direct analogue
   * of cognate over-claiming in Spanish.
   */
  makePseudowordCandidates(donors, corpus, count, seen) {
    const pairs = donors.filter((d) => d.word.length === 2);
    if (pairs.length < 2) return [];

    // Second characters of other real words: content characters, by
    // construction, rather than particles.
    const seconds = [...new Set(pairs.map((d) => d.word[1]!))];
    const out: string[] = [];

    for (const donor of evenlySpaced(pairs, count * 6)) {
      if (out.length >= count) break;
      const head = donor.word[0]!;
      for (let k = 0; k < seconds.length; k++) {
        // Offset the pick per donor so the set does not collapse onto one tail.
        const tail = seconds[(k + out.length * 5 + 3) % seconds.length]!;
        if (tail === donor.word[1] || tail === head) continue;
        const candidate = `${head}${tail}`;
        if (corpus.has(candidate) || seen.has(candidate)) continue;
        seen.add(candidate);
        out.push(candidate);
        break;
      }
    }
    return out;
  },

  // Absence from a 50k list is decent evidence but not proof.
  vetPseudowords: (candidates) =>
    vetWithModel(
      candidates,
      "Simplified Chinese",
      "These are meant to be INVENTED non-words. Mark one to DROP if it is in fact a real Chinese word, a name, a common set phrase, or uses a Traditional character.",
    ),
};

// --- Bahasa Indonesia -------------------------------------------------------

/** Letters and internal hyphens only - reduplication lives inside the word. */
const INDONESIAN_WORD = /^[a-z]+(?:-[a-z]+)*$/;

/** Vowels that may be swapped to make a pseudoword. Deliberately NOT `e`. */
const ID_VOWELS = ["a", "i", "u", "o"];

let indonesianRoots = new Set<string>();
let englishRank = new Map<string, number>();

/**
 * Can this word be traced back to an Indonesian root?
 *
 * Reuses the language module's own affix stripper, which is a good sign the
 * abstraction sits in the right place: the thing that decides difficulty at
 * runtime is the same thing that cleans the corpus at build time.
 */
function rootDerivable(word: string): boolean {
  const isRoot = (f: string) => indonesianRoots.has(f);
  if (isRoot(word)) return true;
  return getLanguage("id").baseForms(word, isRoot).some(isRoot);
}

/** Common in BOTH languages, so the English filter would take them by mistake. */
const ID_KEEP = new Set([
  "ya", "di", "ke", "dia", "ini", "itu", "ada", "aku", "kau", "sana", "sini", "ia",
]);

const indonesian: Strategy = {
  code: "id",
  name: "Indonesian",
  frequencyUrl:
    "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/id/id_50k.txt",

  /**
   * The list is badly contaminated with English - "the" is at rank 202, "you"
   * 297, "and" 494, "john" 526 - because these are subtitles and Indonesian is
   * ASCII Latin, the same shape as the contaminant. Chinese gets this filtering
   * for free from its Han regex and Spanish from its accents plus a 636k-form
   * dictionary. Indonesian has neither.
   *
   * Left alone it poisons three things at once: the frequency ruler everything
   * is measured against, the placement items, and the register anchors quoted
   * back to the model as examples of ordinary vocabulary.
   *
   * So drop a word only if it is common ENGLISH and cannot be traced to an
   * Indonesian root. The second clause is what keeps loanwords (bank, hotel,
   * film, radio) and every affixed form - a naive root-dictionary test would
   * throw those away along with about half the corpus.
   */
  isValidWord: (word) =>
    INDONESIAN_WORD.test(word) &&
    word.length >= 2 &&
    (ID_KEEP.has(word) ||
      (englishRank.get(word) ?? Infinity) > 3_000 ||
      rootDerivable(word)),

  async prepare() {
    // Root words only - no affixed forms, no proper nouns. Exactly the shape
    // needed to tell Indonesian from English.
    const roots = await fetchText(
      "https://raw.githubusercontent.com/sastrawi/sastrawi/master/data/kata-dasar.txt",
      "Indonesian root list",
    );
    indonesianRoots = new Set(
      roots
        .split("\n")
        .map((l) => l.trim().toLowerCase())
        .filter(Boolean),
    );

    const english = await fetchText(
      "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt",
      "English frequency list",
    );
    englishRank = new Map(
      english
        .split("\n")
        .map((l) => l.trim().split(/\s+/)[0]?.toLowerCase())
        .filter((w): w is string => Boolean(w))
        .map((w, i) => [w, i + 1]),
    );

    console.log(
      `  ${indonesianRoots.size.toLocaleString()} roots, ` +
        `${englishRank.size.toLocaleString()} English ranks for filtering.`,
    );
  },

  /**
   * Stricter than isValidWord, because this governs what a HUMAN is shown -
   * placement items and register anchors. Hyphenated words are excluded because
   * knowing "anak-anak" is just knowing "anak" twice.
   */
  isTestable: (word) =>
    word.length >= 4 && word.length <= 16 && !word.includes("-") && rootDerivable(word),

  /**
   * Vetted by the model, not left to the root list.
   *
   * The root list was supposed to make this a no-op the way Spanish's
   * dictionary does. It does not: `paul` and `cina` are both in kata-dasar and
   * both duly turned up as placement items on the first build. A name is the
   * one thing a yes/no vocabulary test must not contain, because everybody
   * marks it known and it measures nothing - which is the whole reason Spanish
   * pulls in a 636k-form dictionary in the first place.
   */
  vetItems: (words) =>
    vetWithModel(
      words,
      "Indonesian",
      // Misspellings and crude terms matter beyond the test items: the same
      // vetted pool becomes anchors.json, which is quoted VERBATIM into the
      // generation prompt as examples of vocabulary at a level. A subtitle
      // typo like "anaku" for "anakku" teaches the model the wrong spelling.
      "Mark a word to DROP if it is: a personal name, a place name, a brand, or a transliteration of a foreign name; an English word rather than an Indonesian one; a multi-word phrase rather than a single word; a misspelling of a correctly-spelled Indonesian word; or crude anatomical or sexual slang.",
    ),

  makePseudowordCandidates(donors, corpus, count, seen) {
    const out: string[] = [];
    for (const donor of evenlySpaced(donors, count * 8)) {
      if (out.length >= count) break;
      const fake = substituteIndonesianVowel(donor.word, corpus);
      if (fake && !seen.has(fake)) {
        seen.add(fake);
        out.push(fake);
      }
    }
    return out;
  },

  // Absence from a 50k list is weaker evidence here than elsewhere: Indonesian
  // affixation is productive enough that a well-formed invention can simply be
  // a word nobody has happened to write down.
  vetPseudowords: (candidates) =>
    vetWithModel(
      candidates,
      "Indonesian",
      "These are meant to be INVENTED non-words. Mark one to DROP if it is in fact a real Indonesian word, a well-formed affixed form of a real root, a regional or colloquial spelling variant, a Malay word, or a name.",
    ),
};

/**
 * Swap one vowel, scanning from the END of the word.
 *
 * From the end so the prefix survives: a mutated me-/ber-/peng- announces itself
 * as broken, while a changed final syllable reads like an affixed word you
 * half-know, which is what a catch trial needs.
 *
 * `e` is never touched and never substituted in. It is the schwa, and swapping
 * it lands on a real regional spelling - sekarang to sakarang - that a learner
 * is right to claim they know, which destroys the trial.
 */
function substituteIndonesianVowel(word: string, corpus: Set<string>): string | null {
  for (let i = word.length - 2; i >= 1; i--) {
    if (!ID_VOWELS.includes(word[i]!)) continue;
    for (const v of ID_VOWELS) {
      if (v === word[i]) continue;
      const candidate = word.slice(0, i) + v + word.slice(i + 1);
      if (corpus.has(candidate)) continue;
      if (indonesianRoots.has(candidate)) continue;
      if (rootDerivable(candidate)) continue;
      return candidate;
    }
  }
  return null;
}

/**
 * Ask the model which candidates to keep.
 *
 * Used where an open dictionary is not available. Batched into one call per
 * build, and it fails OPEN - if the model is unavailable the candidates are
 * kept rather than the build breaking, since a slightly noisy test item is a
 * far smaller problem than no data at all.
 */
async function vetWithModel(
  candidates: string[],
  language: string,
  instruction: string,
): Promise<Set<string>> {
  if (!candidates.length) return new Set();
  console.log(`  vetting ${candidates.length} ${language} candidates ...`);

  try {
    const { object } = await generateStructured({
      schema: z.object({
        drop: z
          .array(z.string())
          .describe("Exactly the input items that should be dropped."),
      }),
      system: `You are a careful lexicographer of ${language}.`,
      prompt: [
        instruction,
        "",
        "Return only the items to drop, copied exactly. Return an empty array if none.",
        "",
        candidates.join("\n"),
      ].join("\n"),
      temperature: 0,
    });

    const drop = new Set(object.drop.map((w) => w.trim()));
    console.log(`  dropped ${drop.size}: ${[...drop].slice(0, 12).join(", ")}`);
    return new Set(candidates.filter((c) => !drop.has(c)));
  } catch (err) {
    console.warn(
      `  vetting unavailable (${err instanceof Error ? err.message.slice(0, 80) : err}); keeping all`,
    );
    return new Set(candidates);
  }
}

// --- Build ------------------------------------------------------------------

const STRATEGIES: Record<string, Strategy> = {
  es: spanish,
  "zh-CN": chinese,
  id: indonesian,
};

async function main() {
  const code = process.env.LANGUAGE ?? "es";
  const strategy = STRATEGIES[code];
  if (!strategy) {
    throw new Error(
      `No build strategy for "${code}". Known: ${Object.keys(STRATEGIES).join(", ")}`,
    );
  }
  console.log(`Building ${strategy.name} (${strategy.code})\n`);

  const raw = await fetchText(strategy.frequencyUrl, "frequency list");
  await strategy.prepare();

  // Each line is "word count", most frequent first.
  const words: string[] = [];
  for (const line of raw.split("\n")) {
    const word = line.split(" ")[0]?.trim().toLowerCase();
    if (!word || !strategy.isValidWord(word)) continue;
    words.push(word);
  }
  const corpus = new Set(words);
  console.log(`Kept ${words.length.toLocaleString()} frequency-ranked words.`);

  // Skip rank 1-50: everyone knows them, and an item nobody ever gets wrong
  // carries no information about the learner.
  const testable = words
    .map((word, i) => ({ word, rank: i + 1 }))
    .filter(({ word, rank }) => rank > 50 && strategy.isTestable(word));
  console.log(`${testable.length.toLocaleString()} eligible as test items.`);

  // Everything a learner or the model will actually SEE gets vetted, in one
  // pass rather than per band. Anchors matter as much as test items here: they
  // are quoted into the generation prompt as examples of the right register, so
  // a proper noun or a Traditional character among them actively teaches the
  // model the wrong thing.
  const sampled = BANDS.flatMap((maxRank, i) => {
    const minRank = i === 0 ? 51 : BANDS[i - 1]! + 1;
    return evenlySpaced(
      testable.filter((t) => t.rank >= minRank && t.rank <= maxRank),
      WORDS_PER_BAND,
    );
  });
  const anchorCandidates = ANCHOR_EDGES.flatMap((fromRank) =>
    evenlySpaced(
      testable.filter((t) => t.rank > fromRank && t.rank <= fromRank * 2),
      ANCHOR_WORDS,
    ),
  );
  const vetted = await strategy.vetItems([
    ...new Set([...sampled, ...anchorCandidates].map((t) => t.word)),
  ]);

  // Catch trials come from each band's own donors - what counts as an
  // over-claim varies by band, so the correction has to be measured locally.
  // Over-generate, then vet the whole lot in ONE pass: a language that needs a
  // model call for this should make one, not one per band.
  const seenPseudo = new Set<string>();
  const OVERSAMPLE = 2;
  const candidatesByBand = BANDS.map((maxRank, i) => {
    const minRank = i === 0 ? 51 : BANDS[i - 1]! + 1;
    let candidates: string[] = [];
    for (const factor of [1, 2, 4]) {
      if (candidates.length >= PSEUDOWORDS_PER_BAND * OVERSAMPLE) break;
      const donors = testable.filter(
        (t) => t.rank >= minRank / factor && t.rank <= maxRank * factor,
      );
      candidates = candidates.concat(
        strategy.makePseudowordCandidates(
          donors,
          corpus,
          PSEUDOWORDS_PER_BAND * OVERSAMPLE - candidates.length,
          seenPseudo,
        ),
      );
    }
    return candidates;
  });

  const keptPseudo = await strategy.vetPseudowords(candidatesByBand.flat());

  const bands = BANDS.map((maxRank, i) => {
    const minRank = i === 0 ? 51 : BANDS[i - 1]! + 1;
    const inBand = testable.filter((t) => t.rank >= minRank && t.rank <= maxRank);
    return {
      minRank,
      maxRank,
      words: evenlySpaced(inBand, WORDS_PER_BAND)
        .map((t) => t.word)
        .filter((w) => vetted.has(w)),
      pseudowords: candidatesByBand[i]!
        .filter((c) => keptPseudo.has(c))
        .slice(0, PSEUDOWORDS_PER_BAND),
    };
  });

  for (const b of bands) {
    console.log(`  band ${b.minRank}-${b.maxRank} (width ${b.maxRank - b.minRank + 1})`);
    console.log(`    real:   ${b.words.join(", ")}`);
    console.log(`    catch:  ${b.pseudowords.join(", ")}`);
  }

  // Register anchors: what "just past the band" sounds like, for the model.
  const anchors = ANCHOR_EDGES.map((fromRank) => ({
    fromRank,
    words: evenlySpaced(
      testable.filter((t) => t.rank > fromRank && t.rank <= fromRank * 2),
      ANCHOR_WORDS,
    )
      .map((t) => t.word)
      .filter((w) => vetted.has(w)),
  }));
  for (const a of anchors) {
    console.log(`  anchors past ${a.fromRank}: ${a.words.slice(0, 8).join(", ")}`);
  }

  const outDir = join("src", "data", strategy.code);
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "frequency.json"),
    JSON.stringify({ source: strategy.frequencyUrl, words }),
  );
  // Chinese places by HSK level, not by frequency rank, and `npm run hsk` owns
  // that file. Writing frequency bands over it here would silently undo the
  // whole reason it exists - the frequency test could not be failed, because a
  // subtitle corpus holds no 9,000 rare Chinese words to put in its top band.
  //
  // Skipped rather than made an error: everything else this script produces for
  // Chinese is still wanted, and frequency.json is what build-hsk sorts the
  // 7-9 band by.
  if (strategy.code === "zh-CN") {
    console.log(
      "Leaving placement.json alone - Chinese bands by HSK level. Run `npm run hsk` to rebuild it.",
    );
  } else {
    await writeFile(
      join(outDir, "placement.json"),
      JSON.stringify({ maxRank: TEST_MAX_RANK, bands }, null, 2),
    );
  }
  await writeFile(join(outDir, "anchors.json"), JSON.stringify({ anchors }, null, 2));

  // Seed an empty samples.json if there is not one already. src/server/frequency
  // imports it statically, so a language whose data directory lacks the file
  // cannot be loaded at all - including by `npm run samples`, which is what
  // fills it. Never clobber real samples: they cost model calls to produce.
  const samplesPath = join(outDir, "samples.json");
  if (!existsSync(samplesPath)) {
    await writeFile(samplesPath, JSON.stringify({ samples: [] }, null, 2));
    console.log(`Seeded empty ${samplesPath} - run \`LANGUAGE=${strategy.code} npm run samples\` to fill it.`);
  }

  console.log(
    strategy.code === "zh-CN"
      ? `\nWrote ${outDir}/{frequency,anchors}.json`
      : `\nWrote ${outDir}/{frequency,placement,anchors}.json`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
