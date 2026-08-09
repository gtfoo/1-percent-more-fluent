/**
 * Bahasa Indonesia.
 *
 * Structurally the closest language to Spanish the app has: Latin script, spaces
 * between words, ASCII terminators, phonemic spelling. Text handling is Spanish's
 * with one change - the hyphen is part of the word - and the interesting work is
 * all in `baseForms`.
 *
 * Indonesian has no conjugation, no gender, no number agreement and no tense.
 * What it has instead is affixation, and unlike Spanish's endings the affixes
 * are ambiguous: the same prefix eats one root's first letter and leaves the
 * next one's alone. That is why this module cannot strip blind the way es.ts
 * does, and why `isKnown` is load-bearing here rather than unused.
 */
import type { GrammarGate, Language, PlacedWord, Token } from "./types";
import { UI_ID, FORMAT_ID } from "./ui-id";

// --- Text -------------------------------------------------------------------
// Plain ASCII throughout: modern Indonesian orthography has no diacritics at
// all, so this file needs none of the \uXXXX escaping es.ts uses to stay
// readable.

/**
 * The hyphen is INSIDE the word.
 *
 * Reduplication is Indonesian's plural and it is not marginal - the corpus has
 * 2,184 hyphenated entries, with anak-anak, orang-orang and benar-benar all in
 * the top 300. Splitting on the hyphen would gloss anak-anak ("children") as
 * anak ("child"), and would turn bertahun-tahun into a form that appears
 * nowhere.
 */
const WORD_RE = /[A-Za-z]+(?:-[A-Za-z]+)*/g;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;

  for (const match of text.matchAll(WORD_RE)) {
    const start = match.index;
    if (start > cursor) {
      tokens.push({ text: text.slice(cursor, start), isWord: false });
    }
    tokens.push({ text: match[0], isWord: true });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) {
    tokens.push({ text: text.slice(cursor), isWord: false });
  }
  return tokens;
}

function wordsWithOffsets(text: string): PlacedWord[] {
  const out: PlacedWord[] = [];
  for (const m of text.matchAll(WORD_RE)) {
    // `length` comes from the raw match, not the lowercased text, because it is
    // what topic-term spans are measured against.
    out.push({ text: m[0].toLowerCase(), at: m.index, length: m[0].length });
  }
  return out;
}

function words(text: string): string[] {
  return wordsWithOffsets(text).map((w) => w.text);
}

/**
 * Keeps the internal hyphen, or the idempotency check breaks: it runs over
 * `words()` output, which contains anak-anak. Collapsing runs and trimming the
 * edges is what makes a second pass the identity.
 */
function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^a-z-]+/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** ASCII terminators, exactly as in Spanish - and the same abbreviation blind spot. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// --- Morphology -------------------------------------------------------------

const MIN_STEM = 3;

/** Peeled first and unconditionally: these are clitics, not derivation. */
const CLITICS = ["nya", "lah", "kah", "pun", "ku", "mu"];

const SUFFIXES = ["kan", "an", "i"];

/**
 * Prefix, and what the stem may have STARTED with.
 *
 * An empty string means the prefix left the root alone; a letter means the
 * prefix swallowed it and it has to be put back. This is the whole difficulty
 * of Indonesian morphology, and the reason `isKnown` is not optional here:
 *
 *   menulis   -> men- + tulis    the /t/ was eaten
 *   mendengar -> men- + dengar   the /d/ was kept
 *
 * Same prefix, opposite behaviour, and nothing in the surface form says which.
 * So every candidate is offered and the corpus decides. A stripper that always
 * elides gets mendengar wrong; one that never elides gets menulis wrong.
 *
 * Longest first, so "memper" is tried before "mem" and "meng" before "me".
 */
const PREFIXES: [string, string[]][] = [
  ["memper", [""]],
  ["diper", [""]],
  ["keber", [""]],
  // Monosyllabic roots take the -e- form: mengebom, mengecat.
  ["menge", [""]],
  ["penge", [""]],
  ["meng", ["", "k", "g", "h"]],
  ["peng", ["", "k", "g", "h"]],
  ["meny", ["s", "ny"]],
  ["peny", ["s", "ny"]],
  ["mem", ["", "b", "p", "f", "v"]],
  ["pem", ["", "b", "p", "f", "v"]],
  ["men", ["", "d", "t", "c", "j", "z"]],
  ["pen", ["", "d", "t", "c", "j", "z"]],
  ["ber", [""]],
  ["ter", [""]],
  ["per", [""]],
  // belajar = ber + ajar, pelajar = per + ajar. Irregular, and common.
  ["bel", [""]],
  ["pel", [""]],
  // bekerja = ber + kerja: the /r/ drops before a root starting with /r/ or
  // containing one in the first syllable.
  ["be", [""]],
  ["me", [""]],
  ["pe", [""]],
  ["di", [""]],
  ["ke", [""]],
  ["se", [""]],
  // Proclitics: kupikir, kaubilang.
  ["ku", [""]],
  ["kau", [""]],
];

function stripClitics(word: string): string[] {
  const out = [word];
  for (const c of CLITICS) {
    if (word.endsWith(c) && word.length - c.length >= MIN_STEM) {
      out.push(word.slice(0, -c.length));
    }
  }
  return out;
}

function stripSuffix(word: string): string[] {
  const out = [word];
  for (const s of SUFFIXES) {
    if (word.endsWith(s) && word.length - s.length >= MIN_STEM) {
      out.push(word.slice(0, -s.length));
    }
  }
  return out;
}

function stripPrefix(word: string): string[] {
  const out = [word];
  for (const [prefix, restores] of PREFIXES) {
    if (!word.startsWith(prefix)) continue;
    const rest = word.slice(prefix.length);
    for (const first of restores) {
      const stem = first + rest;
      if (stem.length >= MIN_STEM) out.push(stem);
    }
  }
  return out;
}

/**
 * Every form of `word` worth looking up.
 *
 * Two things differ from Spanish. First, `isKnown` is consulted rather than
 * ignored, for the assimilation reason above. Second, the derived form is often
 * COMMONER than its root here - bertemu is rank 165 while temu is 12,743 - so
 * most affixed words already resolve on their own and this earns its keep on
 * the layered ones (penglihatan, penulisan, ketiduran) and on reduplication.
 *
 * At most one clitic, one suffix and one prefix, in both orders. Deliberately
 * not recursive to a bare root: mempertanggungjawabkan really is a hard word,
 * and peeling it all the way to tanggung would smuggle it into a beginner band.
 *
 * Intermediates are walked UNFILTERED - "kataan" is not a word but it is the
 * only road from perkataan to kata - while only forms the corpus recognises are
 * kept.
 */
function baseForms(word: string, isKnown: (form: string) => boolean): string[] {
  const forms = new Set<string>([word]);
  const accept = (f: string) => {
    if (f.length >= MIN_STEM && isKnown(f)) forms.add(f);
  };

  // Reduplication: anak-anak, buku-buku. Halves that differ (sayur-mayur,
  // Jakarta-Bandung) are still offered separately - the contract says err
  // towards more candidates, and since the caller takes the best rank an extra
  // candidate can only ever make a word look easier, never harder.
  const seeds = new Set<string>([word]);
  for (const part of word.split("-")) {
    if (part !== word) {
      seeds.add(part);
      accept(part);
    }
  }

  for (const seed of seeds) {
    for (const a of stripClitics(seed)) {
      accept(a);
      for (const b of stripSuffix(a)) {
        accept(b);
        for (const c of stripPrefix(b)) accept(c);
      }
      for (const b of stripPrefix(a)) {
        accept(b);
        for (const c of stripSuffix(b)) accept(c);
      }
    }
  }

  return [...forms];
}

// --- Difficulty -------------------------------------------------------------
// Not a translation of the Spanish ladder. `yang` is rank 3 and the di- passive
// is ordinary speech rather than a formal register, so both arrive far earlier
// than their Spanish equivalents; conversely the affix system, which Spanish
// has no counterpart for, is what separates an intermediate reader from a
// beginner.

const GRAMMAR: GrammarGate[] = [
  {
    minLevel: 0,
    allows:
      "plain SVO; adalah and ada; tidak and bukan for negation; possession with -nya or a bare pronoun; ini and itu; apa, siapa and di mana questions",
  },
  {
    minLevel: 18,
    allows:
      "yang for simple relative clauses; sudah, belum, akan and sedang in place of tense; bisa, harus, mau, ingin; ber- verbs; reduplication for plurals; classifiers (orang, buah, ekor)",
  },
  {
    minLevel: 32,
    allows:
      "meN- verbs with -kan and -i; the di- passive, which is everyday rather than formal here; ter- for the accidental and the superlative; lebih and paling; karena, tetapi, kalau",
  },
  {
    minLevel: 46,
    allows:
      "ke-...-an and peN-...-an nominalisations; se- constructions (sebelum, sesudah, sebagai); stacked yang clauses; -lah for emphasis",
  },
  {
    minLevel: 60,
    allows:
      "memper- and diper- causatives; resultative ter-; meskipun, sehingga, agar; the formal saya and Anda register",
  },
  {
    minLevel: 74,
    allows:
      "written bahasa baku and journalistic register; layered affixation such as mempertanggungjawabkan",
  },
  {
    minLevel: 88,
    allows:
      "idiom, literary register, and colloquial Jakartan (nggak, gue, banget) used knowingly; any construction",
  },
];

/**
 * CEFR, with Spanish's thresholds unchanged.
 *
 * Not UKBI: that is a NATIVE-speaker exam calibrated against Indonesians, so
 * telling a foreign learner they are "Semenjana" conveys nothing, and its levels
 * are not vocabulary-size based. BIPA teaching already aligns to CEFR, and it is
 * the scale the app's Spanish readers already see. The label is never an input
 * to anything - see levelLabel in types.ts.
 */
const CEFR_THRESHOLDS: { max: number; label: string }[] = [
  { max: 1_000, label: "A1" },
  { max: 2_000, label: "A2" },
  { max: 4_000, label: "B1" },
  { max: 8_000, label: "B2" },
  { max: 16_000, label: "C1" },
  { max: Infinity, label: "C2" },
];

export const indonesian: Language = {
  code: "id",
  name: "Indonesian",
  tokenize,
  words,
  wordsWithOffsets,
  sentences,
  normalizeWord,
  baseForms,
  grammar: GRAMMAR,
  /**
   * Spelling is phonemic, so a transcription would be noise - the same reason
   * Spanish has none.
   *
   * The one real gap is <e>, which is both /e/ and schwa (merah, besar) and is
   * genuinely not recoverable from the spelling. One ambiguous vowel does not
   * justify shipping a dictionary to the browser, and there is no standard
   * transcription convention to ship even if it did.
   */
  pronunciation: null,
  ui: UI_ID,
  uiFormat: FORMAT_ID,
  // Earlier than Spanish's 40: no gender, no conjugation, phonemic spelling,
  // and much of the chrome vocabulary is transparent (Masuk, Keluar, Tutup).
  uiFromLevel: 35,
  registerExamples:
    '"melihat" not "menyaksikan", "rumah" not "kediaman", "mulai" not "mengawali" - everyday spoken Indonesian over baku journalistic register',
  levelLabel: (vocabSize) => CEFR_THRESHOLDS.find((t) => vocabSize < t.max)!.label,
  // Pure ASCII, so Source Serif covers it completely and the Spanish stack works
  // verbatim. This is the one place Indonesian is free where Thai and Korean
  // would not be.
  fontStack: "var(--font-reading), Georgia, serif",
};
