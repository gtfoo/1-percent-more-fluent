/**
 * Cheap Spanish morphology, so the difficulty check measures what a learner
 * knows rather than what a word list happens to contain.
 *
 * The frequency corpus is word FORMS. Taken literally that makes "camina",
 * "peces" and "prefiere" rare words, because only "caminar", "pez" and
 * "preferir" are inside a small band. A learner who knows the verb knows the
 * conjugation, so counting those as unknown vocabulary badly overstates the
 * difficulty - and, worse, pushes the generator to avoid perfectly ordinary
 * words and write stilted Spanish.
 *
 * This is not a real lemmatiser. It strips the productive endings and asks
 * whether any plausible base form is inside the band. It errs towards saying
 * "known", which is the right direction: a word wrongly called known costs the
 * reader one tap, while a word wrongly called rare distorts every generation.
 */

/**
 * Inflectional endings, longest first so "ábamos" is tried before "amos".
 * Covers the tenses the level model actually permits, plus participles,
 * gerunds and plurals.
 */
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

/** Candidate infinitives and base forms for a stem. */
function basesFor(stem: string): string[] {
  return [stem, `${stem}ar`, `${stem}er`, `${stem}ir`, `${stem}o`, `${stem}a`, `${stem}e`];
}

const MIN_STEM = 3;

/**
 * Every plausible base form of `word`, including the word itself. Callers test
 * each against the frequency list and treat a hit as "the learner knows this".
 */
export function baseForms(word: string): string[] {
  const forms = new Set<string>([word]);

  // Plurals, including the -es form that restores a consonant stem
  // ("peces" -> "pece" -> "pez" is not reachable, but "flores" -> "flor" is).
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
