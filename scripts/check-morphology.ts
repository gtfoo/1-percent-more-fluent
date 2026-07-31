/**
 * Sanity-check the morphology fallback: inflections of common words should
 * resolve inside a small band, and genuinely rare words should not.
 *
 *   npx tsx scripts/check-morphology.ts
 */
import { rankOf } from "../src/server/frequency";
import { baseForms } from "../src/server/morphology";

const BAND = 2800;

// Flagged as "rare" by the naive surface-form check in the first generation.
const SHOULD_BE_KNOWN = [
  "brilla", "comprende", "prefiere", "desaparece", "sorprendido",
  "camina", "peces", "deseos", "quiere", "puede", "duermen",
  "trabajábamos", "hablando", "vendido", "flores", "veces",
];

// Genuinely beyond a 2,800-word vocabulary.
const SHOULD_BE_RARE = [
  "epinefrina", "psiquiátrica", "sindicato", "furgoneta",
  "alucinando", "presidir", "cortejo", "yacimiento",
];

function best(word: string): { rank: number | null; via: string } {
  let bestRank: number | null = null;
  let via = word;
  for (const form of baseForms(word)) {
    const r = rankOf(form);
    if (r !== null && (bestRank === null || r < bestRank)) {
      bestRank = r;
      via = form;
    }
  }
  return { rank: bestRank, via };
}

let failures = 0;

console.log(`Band = top ${BAND} words\n--- should resolve INSIDE the band ---`);
for (const word of SHOULD_BE_KNOWN) {
  const { rank, via } = best(word);
  const ok = rank !== null && rank <= BAND;
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "MISS"} ${word.padEnd(15)} rank=${String(rank ?? "-").padStart(6)}` +
      `${via !== word ? `  via "${via}"` : ""}`,
  );
}

console.log(`\n--- should stay OUTSIDE the band ---`);
for (const word of SHOULD_BE_RARE) {
  const { rank, via } = best(word);
  const ok = rank === null || rank > BAND;
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "LEAK"} ${word.padEnd(15)} rank=${String(rank ?? "-").padStart(6)}` +
      `${via !== word ? `  via "${via}"` : ""}`,
  );
}

console.log(failures ? `\n${failures} unexpected` : "\nall as expected");
