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
import { score } from "../src/server/placement";
import { placementBands } from "../src/server/frequency";
import { labelFor, levelForVocab } from "../src/lib/level";
import { DEFAULT_LANGUAGE, getLanguage } from "../src/lib/languages";

/** `LANGUAGE=zh-CN npm run placement` scores the same learners elsewhere. */
const LANGUAGE = getLanguage(process.env.LANGUAGE ?? DEFAULT_LANGUAGE);

interface Band {
  minRank: number;
  maxRank: number;
  words: string[];
  pseudowords: string[];
}

const BANDS = placementBands(LANGUAGE.code) as Band[];

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
  /**
   * Expected level range, not a label. Labels are per-language - CEFR for
   * Spanish, HSK for Chinese - but the scorer is not, so asserting on the
   * underlying 0-100 level is what actually tests the scoring.
   */
  expect: [min: number, max: number];
}

const LAST = () => BANDS.length - 1;

const LEARNERS: Learner[] = [
  {
    name: "absolute beginner",
    realRate: (i) => (i === 0 ? 0.4 : 0),
    pseudoRate: () => 0,
    expect: [0, 12],
  },
  {
    // The failure this scorer exists to catch, and the shape is the same in
    // every language even though the cause differs: someone who recognises the
    // PARTS of a word and claims the whole. In Spanish that is Latinate
    // cognates in the rare bands; in Chinese it is a compound of two familiar
    // characters. Both show up as strength in the deep bands with a weak middle
    // - and both over-claim the catch trials there, which is exactly what the
    // per-band correction subtracts back out.
    name: "over-claimer (knows the parts, not the word)",
    realRate: (i) => (i <= 1 ? 0.4 : i >= LAST() - 1 ? 0.8 : 0.2),
    pseudoRate: (i) => (i >= LAST() - 1 ? 0.5 : 0.1),
    expect: [0, 35],
  },
  {
    name: "genuine elementary",
    realRate: (i) => [1, 0.9, 0.7, 0.45, 0.2, 0.1, 0, 0][i] ?? 0,
    pseudoRate: () => 0,
    expect: [25, 45],
  },
  {
    name: "genuine intermediate",
    realRate: (i) => [1, 1, 0.9, 0.8, 0.6, 0.35, 0.15, 0.05][i] ?? 0,
    pseudoRate: () => 0,
    expect: [45, 68],
  },
  {
    name: "genuine advanced",
    realRate: (i) => [1, 1, 1, 1, 0.9, 0.8, 0.6, 0.4][i] ?? 0,
    pseudoRate: () => 0,
    expect: [72, 95],
  },
  {
    name: "near-native",
    realRate: () => 1,
    pseudoRate: () => 0,
    expect: [95, 100],
  },
  {
    name: "clicks everything",
    // Should collapse to near-zero: claiming every catch trial is proof the
    // answers carry no information.
    realRate: () => 1,
    pseudoRate: () => 1,
    expect: [0, 12],
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

  const result = score(shown, known, LANGUAGE.code);
  const level = levelForVocab(result.vocabEstimate);
  const label = labelFor(level, LANGUAGE);
  const [min, max] = learner.expect;
  const ok = level >= min && level <= max;
  if (!ok) failures++;

  console.log(
    `${ok ? "ok  " : "FAIL"} ${learner.name.padEnd(44)} ` +
      `${String(result.vocabEstimate).padStart(6)} words  ` +
      `level ${level.toFixed(0).padStart(3)}  ${label.padEnd(6)}` +
      `${ok ? "" : `  (expected level ${min}-${max})`}`,
  );
  console.log(
    `     credited per band: ${result.perBand
      .map((b) => `${(b.credited * 100).toFixed(0)}%`)
      .join(" ")}   false alarms ${(result.falseAlarmRate * 100).toFixed(0)}%`,
  );
}

console.log(failures ? `\n${failures} failing` : "\nall learners scored as expected");
process.exit(failures ? 1 : 0);
