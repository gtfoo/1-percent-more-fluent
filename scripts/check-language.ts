/**
 * Contract tests every registered language must satisfy.
 *
 *   npm run language
 *
 * Two of these guard invariants the rest of the app silently depends on:
 *
 *  - `tokenize` MUST round-trip. The reader rebuilds the prose from tokens to
 *    make each word tappable, and derives audio character offsets from their
 *    lengths. A tokenizer that drops a space corrupts the highlighting rather
 *    than failing loudly.
 *  - `baseForms` must resolve ordinary inflections into the band. Without it a
 *    conjugation of a common verb reads as rare vocabulary, which overstates
 *    difficulty and pushes the generator into stilted prose.
 *
 * The per-language expectations live in FIXTURES; adding a language means
 * adding an entry, not editing the harness.
 */
import { LANGUAGES } from "../src/lib/languages";
import { rankOf } from "../src/server/frequency";

interface Fixture {
  /** Prose to tokenize and split; must survive a round-trip unchanged. */
  text: string;
  /** How many sentences `text` should split into. */
  sentences: number;
  /** Band used for the baseForms checks below. */
  band: number;
  /** Inflections that must resolve INSIDE the band via some base form. */
  known: string[];
  /** Words that must stay outside it. */
  rare: string[];
}

const FIXTURES: Record<string, Fixture> = {
  es: {
    text: "El hombre camina. ¿Prefiere el pez? ¡Sí, muchas veces!",
    sentences: 3,
    band: 2_800,
    known: [
      "comprende", "prefiere", "sorprendido", "camina", "peces", "deseos",
      "quiere", "puede", "duermen", "trabajábamos", "hablando", "vendido",
      "flores", "veces",
    ],
    rare: [
      "epinefrina", "psiquiátrica", "sindicato", "furgoneta",
      "alucinando", "presidir", "cortejo", "yacimiento",
    ],
  },
  "zh-CN": {
    // Full-width punctuation, no spaces: the round-trip check is doing real
    // work here in a way it barely is for Spanish.
    text: "他犹豫了一下。我们知道什么时候去北京大学学习中文！你呢？",
    sentences: 3,
    band: 3_000,
    // Compounds the segmenter emits as one token but the frequency list stores
    // in pieces - the exact case baseForms exists to handle. 什么时候 is absent
    // from the list; 什么 (12) and 时候 (110) are both near the top of it.
    known: ["什么时候", "北京大学", "为什么", "知道", "什么", "时候"],
    rare: ["犹豫", "慷慨", "赠送", "经文"],
  },
};

let failures = 0;

function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label.padEnd(46)} ${detail}`);
}

function bestRank(word: string, code: string): number | null {
  let best: number | null = null;
  const forms = LANGUAGES[code]!.baseForms(word, (f) => rankOf(f, code) !== null);
  for (const form of forms) {
    const rank = rankOf(form, code);
    if (rank !== null && (best === null || rank < best)) best = rank;
  }
  return best;
}

for (const [code, language] of Object.entries(LANGUAGES)) {
  console.log(`\n=== ${language.name} (${code}) ===`);

  const fixture = FIXTURES[code];
  if (!fixture) {
    check(false, "has a fixture", "add one to scripts/check-language.ts");
    continue;
  }

  // --- tokenize round-trips ---
  const rebuilt = language
    .tokenize(fixture.text)
    .map((t) => t.text)
    .join("");
  check(
    rebuilt === fixture.text,
    "tokenize round-trips exactly",
    rebuilt === fixture.text ? "" : `got ${JSON.stringify(rebuilt)}`,
  );

  // --- words and sentences ---
  const words = language.words(fixture.text);
  check(words.length > 0, "words() finds words", `${words.length} words`);

  // --- offsets agree with words(), and actually point at the right text ---
  // Difficulty measurement uses the offsets to decide whether a word sits
  // inside a protected topic term, while frequency lookup uses the normalised
  // form. If the two walks ever disagree, terms silently stop being protected.
  const placed = language.wordsWithOffsets(fixture.text);
  const sameList =
    placed.length === words.length && placed.every((p, i) => p.text === words[i]);
  check(
    sameList,
    "wordsWithOffsets() matches words() exactly",
    sameList ? "" : `${placed.length} vs ${words.length}`,
  );

  const misplaced = placed.find(
    (p) =>
      language.normalizeWord(fixture.text.slice(p.at, p.at + p.length)) !==
      language.normalizeWord(p.text),
  );
  check(
    !misplaced,
    "every offset points at its own word in the raw text",
    misplaced
      ? `${JSON.stringify(misplaced.text)} at ${misplaced.at} is ${JSON.stringify(
          fixture.text.slice(misplaced.at, misplaced.at + misplaced.length),
        )}`
      : "",
  );
  const sentences = language.sentences(fixture.text);
  check(
    sentences.length === fixture.sentences,
    "sentences() splits correctly",
    `${sentences.length}, expected ${fixture.sentences}`,
  );

  // --- normalizeWord is idempotent ---
  const once = words.map((w) => language.normalizeWord(w));
  const twice = once.map((w) => language.normalizeWord(w));
  check(
    once.every((w, i) => w === twice[i]),
    "normalizeWord is idempotent",
  );

  // --- baseForms ---
  const missed = fixture.known.filter((w) => {
    const rank = bestRank(w, code);
    return rank === null || rank > fixture.band;
  });
  check(
    missed.length === 0,
    `baseForms resolves inflections into ${fixture.band}`,
    missed.length ? `missed: ${missed.join(", ")}` : `${fixture.known.length} checked`,
  );

  const leaked = fixture.rare.filter((w) => {
    const rank = bestRank(w, code);
    return rank !== null && rank <= fixture.band;
  });
  check(
    leaked.length === 0,
    "rare words stay outside the band",
    leaked.length ? `leaked: ${leaked.join(", ")}` : `${fixture.rare.length} checked`,
  );

  // --- the level model has something to say at every level ---
  const gated = [0, 50, 100].map((l) =>
    language.grammar.filter((g) => l >= g.minLevel).length,
  );
  check(
    gated[0]! > 0 && gated[2]! >= gated[1]! && gated[1]! >= gated[0]!,
    "grammar gates are cumulative and non-empty",
    gated.join(" -> "),
  );
  check(
    Boolean(language.levelLabel(500)) && Boolean(language.levelLabel(20_000)),
    "levelLabel covers the whole scale",
    `${language.levelLabel(500)} .. ${language.levelLabel(20_000)}`,
  );
}

console.log(failures ? `\n${failures} failing` : "\nall languages satisfy the contract");
process.exit(failures ? 1 : 0);
