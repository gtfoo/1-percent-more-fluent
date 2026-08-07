/**
 * Spanish.
 *
 * Text handling and morphology moved here wholesale from src/lib/spanish.ts and
 * src/server/morphology.ts; the behaviour is unchanged and the checks in
 * `npm run morphology` guard that.
 */
import type { GrammarGate, Language, PlacedWord, Token } from "./types";

// --- Text -------------------------------------------------------------------
// Built with `new RegExp` so this file stays plain ASCII: combining marks and
// accented literals are invisible in an editor and easy to corrupt.

const LETTER =
  "a-z\\u00e1\\u00e9\\u00ed\\u00f3\\u00fa\\u00fc\\u00f1A-Z\\u00c1\\u00c9\\u00cd\\u00d3\\u00da\\u00dc\\u00d1";
const WORD_RE = new RegExp(`[${LETTER}]+`, "g");
const NON_WORD_RE = new RegExp(`[^${LETTER}]+`);

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
    // Accents are kept - they distinguish words. `length` comes from the raw
    // match, not the lowercased text, because it is what topic-term spans are
    // measured against.
    out.push({ text: m[0].toLowerCase(), at: m.index, length: m[0].length });
  }
  return out;
}

function words(text: string): string[] {
  return wordsWithOffsets(text).map((w) => w.text);
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(NON_WORD_RE, "");
}

/**
 * Spanish opens questions and exclamations with an inverted mark but closes
 * them with the same characters as English, so splitting on the closers works.
 */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// --- Morphology -------------------------------------------------------------
// Not a real lemmatiser: it strips the productive endings and asks whether any
// plausible base form is inside the band. Without this, "camina", "peces" and
// "prefiere" all read as rare words because only "caminar", "pez" and
// "preferir" are in a small band - which overstates difficulty and pushes the
// generator to avoid ordinary vocabulary.

/** Longest first, so "ábamos" is tried before "amos". */
const ENDINGS = [
  // conditional / future
  "aríamos", "eríamos", "iríamos", "aríais", "eríais", "iríais",
  "arían", "erían", "irían", "arías", "erías", "irías",
  "aría", "ería", "iría", "aremos", "eremos", "iremos",
  "arán", "erán", "irán", "arás", "erás", "irás", "ará", "erá", "irá",
  "aré", "eré", "iré",
  // imperfect
  "ábamos", "íamos", "abais", "aban", "abas", "aba", "ían", "ías", "ía",
  // preterite
  "asteis", "isteis", "aron", "ieron", "aste", "iste", "ó", "é", "í",
  // participles and gerunds
  "iendo", "ando", "ados", "adas", "idos", "idas", "ado", "ada", "ido", "ida",
  // present / subjunctive
  "amos", "emos", "imos", "áis", "éis", "an", "en", "as", "es", "ís",
  // bare stems and plurals
  "os", "a", "e", "o", "s",
];

const MIN_STEM = 3;

function basesFor(stem: string): string[] {
  return [stem, `${stem}ar`, `${stem}er`, `${stem}ir`, `${stem}o`, `${stem}a`, `${stem}e`];
}

/** Spanish strips endings rather than consulting a lexicon, so `isKnown` is unused. */
function baseForms(word: string): string[] {
  const forms = new Set<string>([word]);

  if (word.endsWith("es") && word.length - 2 >= MIN_STEM) {
    forms.add(word.slice(0, -2));
    // -ces -> -z handles luz/luces, pez/peces, vez/veces.
    if (word.endsWith("ces")) forms.add(`${word.slice(0, -3)}z`);
  }
  if (word.endsWith("s") && word.length - 1 >= MIN_STEM) {
    forms.add(word.slice(0, -1));
  }

  for (const ending of ENDINGS) {
    if (!word.endsWith(ending)) continue;
    const stem = word.slice(0, word.length - ending.length);
    if (stem.length < MIN_STEM) continue;
    for (const base of basesFor(stem)) forms.add(base);

    // Stem-changing verbs: quiere -> querer, puede -> poder, prefiere ->
    // preferir. Undoing the diphthong recovers the infinitive stem.
    const undiphthongised = stem
      .replace(/ie([^aeiou]*)$/, "e$1")
      .replace(/ue([^aeiou]*)$/, "o$1");
    if (undiphthongised !== stem && undiphthongised.length >= MIN_STEM) {
      for (const base of basesFor(undiphthongised)) forms.add(base);
    }
  }

  return [...forms];
}

// --- Difficulty -------------------------------------------------------------
// Spanish grammar arrives in a fairly consistent order for learners. This
// matters more than vocabulary at the low end: a text built entirely from the
// top 500 words is still incomprehensible to a beginner in the imperfect
// subjunctive.

const GRAMMAR: GrammarGate[] = [
  { minLevel: 0, allows: "present indicative; ser/estar/hay; ir a + infinitive for the future" },
  { minLevel: 18, allows: "preterite and imperfect past tenses; direct and indirect object pronouns" },
  { minLevel: 32, allows: "present perfect; simple future; reflexive verbs; comparatives" },
  { minLevel: 46, allows: "conditional; present subjunctive in common triggers (espero que, quiero que)" },
  { minLevel: 60, allows: "full present subjunctive; relative clauses; passive with se" },
  { minLevel: 74, allows: "imperfect subjunctive; conditional perfect; complex subordination" },
  { minLevel: 88, allows: "idiomatic and literary registers; any construction" },
];

/** The widely cited vocabulary sizes for each CEFR band. */
const CEFR_THRESHOLDS: { max: number; label: string }[] = [
  { max: 1_000, label: "A1" },
  { max: 2_000, label: "A2" },
  { max: 4_000, label: "B1" },
  { max: 8_000, label: "B2" },
  { max: 16_000, label: "C1" },
  { max: Infinity, label: "C2" },
];

export const spanish: Language = {
  code: "es",
  name: "Spanish",
  tokenize,
  words,
  wordsWithOffsets,
  sentences,
  normalizeWord,
  baseForms,
  grammar: GRAMMAR,
  pronunciation: null,
  registerExamples:
    '"decir" not "manifestar", "ver" not "contemplar", "casa" not "vivienda"',
  levelLabel: (vocabSize) =>
    CEFR_THRESHOLDS.find((t) => vocabSize < t.max)!.label,
  fontStack: "var(--font-reading), Georgia, serif",
};
