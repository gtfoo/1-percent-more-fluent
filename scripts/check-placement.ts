/**
 * Score synthetic learners against the placement test.
 *
 *   npm run placement
 *
 * This is the test that was missing. The scorer shipped untested and rated a
 * self-assessed A2/B1 learner as C2, because nothing ever fed it a known
 * answer pattern and checked what came back.
 *
 * The important case is COGNATE GUESSER: an English speaker with almost no
 * Spanish who recognises Latinate words wherever they appear. Rare Spanish
 * vocabulary is disproportionately Latinate, so that learner scores *better* on
 * the rarest bands than the middle ones - and the widest bands carry the most
 * weight. They must not come out advanced.
 */
import placement from "../src/data/es/placement.json";
import { score } from "../src/server/placement";
import { cefrFor, levelForVocab } from "../src/lib/level";

interface Band {
  minRank: number;
  maxRank: number;
  words: string[];
  pseudowords: string[];
}

const BANDS = placement.bands as Band[];

/**
 * A learner is described by the share of REAL words they claim per band, and
 * the share of PSEUDOwords they wrongly claim per band. Both are deterministic
 * here (take the first N) so the check does not flake.
 */
interface Learner {
  name: string;
  /** Per band, deepest-first indexing matches BANDS order. */
  realRate: (bandIndex: number) => number;
  pseudoRate: (bandIndex: number) => number;
  expect: string[];
}

const LAST = () => BANDS.length - 1;

const LEARNERS: Learner[] = [
  {
    name: "absolute beginner",
    realRate: (i) => (i === 0 ? 0.4 : 0),
    pseudoRate: () => 0,
    expect: ["A1"],
  },
  {
    name: "cognate guesser (no real Spanish)",
    // Weak everywhere real vocabulary is needed, but strong on the rare
    // Latinate bands - and over-claims the catch trials there for the same
    // reason, which is exactly what the per-band correction is meant to catch.
    realRate: (i) => (i <= 1 ? 0.4 : i >= LAST() - 1 ? 0.8 : 0.2),
    pseudoRate: (i) => (i >= LAST() - 1 ? 0.5 : 0.1),
    expect: ["A1", "A2"],
  },
  {
    name: "genuine A2",
    realRate: (i) => [1, 0.9, 0.7, 0.45, 0.2, 0.1, 0, 0][i] ?? 0,
    pseudoRate: () => 0,
    expect: ["A2"],
  },
  {
    name: "genuine B1",
    realRate: (i) => [1, 1, 0.9, 0.8, 0.6, 0.35, 0.15, 0.05][i] ?? 0,
    pseudoRate: () => 0,
    expect: ["B1"],
  },
  {
    name: "genuine B2/C1",
    realRate: (i) => [1, 1, 1, 1, 0.9, 0.8, 0.6, 0.4][i] ?? 0,
    pseudoRate: () => 0,
    expect: ["B2", "C1"],
  },
  {
    name: "near-native",
    realRate: () => 1,
    pseudoRate: () => 0,
    expect: ["C1", "C2"],
  },
  {
    name: "clicks everything",
    // Should collapse to near-zero: claiming every catch trial is proof the
    // answers carry no information.
    realRate: () => 1,
    pseudoRate: () => 1,
    expect: ["A1"],
  },
];

function take(items: string[], rate: number): string[] {
  return items.slice(0, Math.round(items.length * rate));
}

let failures = 0;

for (const learner of LEARNERS) {
  const shown: string[] = [];
  const known: string[] = [];

  BANDS.forEach((band, i) => {
    shown.push(...band.words, ...band.pseudowords);
    known.push(...take(band.words, learner.realRate(i)));
    known.push(...take(band.pseudowords, learner.pseudoRate(i)));
  });

  const result = score(shown, known);
  const level = levelForVocab(result.vocabEstimate);
  const cefr = cefrFor(level);
  const ok = learner.expect.includes(cefr);
  if (!ok) failures++;

  console.log(
    `${ok ? "ok  " : "FAIL"} ${learner.name.padEnd(34)} ` +
      `${String(result.vocabEstimate).padStart(6)} words  ` +
      `level ${level.toFixed(0).padStart(3)}  ${cefr}` +
      `${ok ? "" : `  (expected ${learner.expect.join("/")})`}`,
  );
  console.log(
    `     credited per band: ${result.perBand
      .map((b) => `${(b.credited * 100).toFixed(0)}%`)
      .join(" ")}   false alarms ${(result.falseAlarmRate * 100).toFixed(0)}%`,
  );
}

console.log(failures ? `\n${failures} failing` : "\nall learners scored as expected");
process.exit(failures ? 1 : 0);
