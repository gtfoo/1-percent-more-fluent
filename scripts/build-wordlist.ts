/**
 * Build the Spanish frequency data the app needs, from hermitdave/FrequencyWords
 * (OpenSubtitles 2018 counts, MIT-licensed).
 *
 *   npm run wordlist
 *
 * Produces two files under src/data/es/:
 *
 *   frequency.json  - the ranked word list. Index 0 is the most common word.
 *                     This is the ruler everything else measures against: the
 *                     level model expresses difficulty as "the top N of this
 *                     list", and the verifier checks generated text against it.
 *
 *   placement.json  - the yes/no vocabulary test: real words sampled from each
 *                     frequency band, plus pseudowords used as catch trials to
 *                     correct for over-claiming.
 *
 * Why OpenSubtitles: it is free, large, and conversational, which matches what
 * a learner actually wants to read and hear. It is *word forms*, not lemmas -
 * that is fine here, because we compare against surface forms too.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SOURCE =
  "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt";

/**
 * A ~636k-form Spanish dictionary, used only to vet test items. The frequency
 * corpus is subtitles, so it is full of proper nouns ("mary", "john") that look
 * like ordinary mid-frequency vocabulary but test nothing. Requiring a
 * dictionary hit removes them - and, applied in reverse, guarantees that a
 * generated pseudoword is not just an obscure real word.
 *
 * This list preserves n-tilde but carries no accents, so comparisons against it
 * fold accents away first.
 */
const DICTIONARY =
  "https://raw.githubusercontent.com/words/an-array-of-spanish-words/master/index.json";

const OUT_DIR = join("src", "data", "es");

// Built with `new RegExp` so the source file stays plain ASCII - combining
// marks are invisible in an editor and easy to corrupt.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");
const DECOMPOSED_N_TILDE = new RegExp("n\\u0303", "g");

/**
 * Strip accents while preserving n-tilde, which is a distinct letter in Spanish
 * rather than an accented `n` - and which the dictionary keeps.
 */
function fold(word: string): string {
  return word
    .normalize("NFD")
    .replace(DECOMPOSED_N_TILDE, "ñ")
    .replace(COMBINING_MARKS, "");
}

/** Letters that can appear in a Spanish word. */
const SPANISH = new RegExp("^[a-z\\u00e1\\u00e9\\u00ed\\u00f3\\u00fa\\u00fc\\u00f1]+$");
/** k and w only show up in loanwords and names - poor test items. */
const LOANWORD_LETTERS = /[kw]/;

// --- Placement test bands ---------------------------------------------------
// Geometric, because vocabulary knowledge falls off geometrically with rank:
// the gap between rank 100 and 200 matters as much as 6,000 to 12,000.
//
// Capped at 20,000 rather than the full 50,000 corpus. Past roughly 20k the
// OpenSubtitles tail stops predicting anything useful about a learner - it is
// technical vocabulary, transliterations and noise - while carrying enormous
// weight in a band-area estimate. The old top band alone spanned 30,000 words,
// 60% of the whole scale, decided by five test items.
const TEST_MAX_RANK = 20_000;

const BANDS: { maxRank: number }[] = [
  { maxRank: 120 },
  { maxRank: 300 },
  { maxRank: 700 },
  { maxRank: 1_500 },
  { maxRank: 3_000 },
  { maxRank: 6_000 },
  { maxRank: 11_000 },
  { maxRank: TEST_MAX_RANK },
];

/** Real words offered per band; the test samples 5 of these at runtime. */
const WORDS_PER_BAND = 8;

/**
 * Pseudowords offered per band; the test samples 2. Crucially these are built
 * from donors *inside the same band*, because the thing they are there to
 * measure varies by band.
 *
 * Rare Spanish words are disproportionately Latinate, so they are MORE
 * transparent to an English speaker, not less - "epinefrina", "presidir",
 * "humanamente", "cafeteria" are all readable with no Spanish at all. Drawing
 * every catch trial from mid-frequency words (as before) measured over-claiming
 * on ordinary vocabulary and then applied that single correction to the tail,
 * where the bias is completely different. Per-band catch trials let the
 * false-alarm correction subtract each band's own cognate inflation.
 */
const PSEUDOWORDS_PER_BAND = 5;

const VOWELS = ["a", "e", "i", "o", "u"];

/**
 * Turn a real word into a plausible non-word by swapping one interior vowel.
 * Vowel substitution preserves Spanish syllable structure, so the result still
 * *looks* and *sounds* Spanish - which is the point. A learner who claims to
 * know "trabejo" is over-claiming, and we can measure by how much.
 */
function pseudoword(
  word: string,
  corpus: Set<string>,
  dictionary: Set<string>,
): string | null {
  const positions: number[] = [];
  for (let i = 1; i < word.length - 1; i++) {
    if (VOWELS.includes(word[i]!)) positions.push(i);
  }

  for (const i of positions) {
    for (const v of VOWELS) {
      if (v === word[i]) continue;
      const candidate = word.slice(0, i) + v + word.slice(i + 1);
      // Reject anything either source recognises. The corpus catches common
      // inflections we might invent by accident (cambio -> cambia); the
      // dictionary catches rare-but-real words a strong learner would know.
      if (corpus.has(candidate)) continue;
      if (dictionary.has(fold(candidate))) continue;
      return candidate;
    }
  }
  return null;
}

/** Deterministic pick so the data file is stable across rebuilds. */
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

async function main() {
  const [raw, dictRaw] = await Promise.all([
    fetchText(SOURCE, "frequency list"),
    fetchText(DICTIONARY, "dictionary"),
  ]);

  // Each line is "word count", most frequent first.
  const words: string[] = [];
  for (const line of raw.split("\n")) {
    const word = line.split(" ")[0]?.trim().toLowerCase();
    if (!word || !SPANISH.test(word)) continue;
    words.push(word);
  }
  const corpus = new Set(words);
  console.log(`Kept ${words.length.toLocaleString()} frequency-ranked words.`);

  const dictionary = new Set(
    (JSON.parse(dictRaw) as string[]).map((w) => w.toLowerCase()),
  );
  console.log(`Dictionary: ${dictionary.size.toLocaleString()} forms.`);

  // --- Test items. Skip rank 1-50: everyone knows "que" and "de", and an item
  // nobody ever gets wrong carries no information about the learner.
  const testable = words
    .map((word, i) => ({ word, rank: i + 1 }))
    .filter(
      ({ word, rank }) =>
        rank > 50 &&
        word.length >= 3 &&
        word.length <= 14 &&
        !LOANWORD_LETTERS.test(word) &&
        dictionary.has(fold(word)),
    );
  console.log(`${testable.length.toLocaleString()} words eligible as test items.`);

  const seenPseudo = new Set<string>();

  const bands = BANDS.map((band, i) => {
    const minRank = i === 0 ? 51 : BANDS[i - 1]!.maxRank + 1;
    const inBand = testable.filter(
      (t) => t.rank >= minRank && t.rank <= band.maxRank,
    );

    // Catch trials come from this band's own donors. Narrow bands at the top of
    // the list can run dry, so widen the donor range until enough are found -
    // still far closer in register than a single global pool.
    const pseudowords: string[] = [];
    for (const factor of [1, 2, 4]) {
      if (pseudowords.length >= PSEUDOWORDS_PER_BAND) break;
      const donors = testable.filter(
        (t) => t.rank >= minRank / factor && t.rank <= band.maxRank * factor,
      );
      for (const donor of evenlySpaced(donors, PSEUDOWORDS_PER_BAND * 8)) {
        if (pseudowords.length >= PSEUDOWORDS_PER_BAND) break;
        const fake = pseudoword(donor.word, corpus, dictionary);
        if (fake && !seenPseudo.has(fake)) {
          seenPseudo.add(fake);
          pseudowords.push(fake);
        }
      }
    }

    return {
      minRank,
      maxRank: band.maxRank,
      words: evenlySpaced(inBand, WORDS_PER_BAND).map((t) => t.word),
      pseudowords,
    };
  });

  for (const b of bands) {
    const width = b.maxRank - b.minRank + 1;
    console.log(`  band ${b.minRank}-${b.maxRank} (width ${width})`);
    console.log(`    real:   ${b.words.join(", ")}`);
    console.log(`    catch:  ${b.pseudowords.join(", ")}`);
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    join(OUT_DIR, "frequency.json"),
    JSON.stringify({ source: SOURCE, words }),
  );
  await writeFile(
    join(OUT_DIR, "placement.json"),
    JSON.stringify({ maxRank: TEST_MAX_RANK, bands }, null, 2),
  );
  console.log(`Wrote ${OUT_DIR}/frequency.json and placement.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
