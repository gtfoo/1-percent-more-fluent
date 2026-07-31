/**
 * Assert the calibration controller moves the level the right way.
 *
 *   npm run calibration
 *
 * The case that matters most is DISENGAGED. A reader who opens a piece far too
 * hard for them taps nothing, answers nothing and leaves - which is exactly
 * what a reader who found it trivially easy also does. Reading that as "too
 * easy" pushed a drowning learner further up, which is how one bad placement
 * estimate got worse instead of self-correcting.
 */
import { nextLevel, overrideLevel, type SessionSignals } from "../src/lib/level";

interface Case {
  name: string;
  from: number;
  signals: SessionSignals;
  expect: (delta: number) => boolean;
  expectation: string;
}

const CASES: Case[] = [
  {
    name: "disengaged: no taps, no quiz, no rating",
    from: 60,
    signals: { lookupRate: 0, engaged: false, sessionCount: 5 },
    expect: (d) => d === 0,
    expectation: "no movement",
  },
  {
    name: "engaged and breezed through",
    from: 60,
    signals: { lookupRate: 0, engaged: true, quizScore: 1, sessionCount: 5 },
    expect: (d) => d > 0,
    expectation: "up",
  },
  {
    name: "drowning: heavy lookups, failed quiz, said too hard",
    from: 60,
    signals: {
      lookupRate: 0.3,
      engaged: true,
      quizScore: 0.33,
      rating: "too-hard",
      sessionCount: 5,
    },
    expect: (d) => d < 0,
    expectation: "down",
  },
  {
    name: "in the sweet spot",
    from: 60,
    signals: {
      lookupRate: 0.05,
      engaged: true,
      quizScore: 0.8,
      rating: "just-right",
      sessionCount: 5,
    },
    expect: (d) => d === 0,
    expectation: "no movement",
  },
  {
    name: "first session, badly mispitched",
    from: 90,
    signals: {
      lookupRate: 0.3,
      engaged: true,
      quizScore: 0,
      rating: "too-hard",
      sessionCount: 0,
    },
    // A brand-new estimate must be able to escape fast; 8 points is not enough
    // when the placement test has put someone 40 points out.
    expect: (d) => d <= -15,
    expectation: "down by at least 15",
  },
  {
    name: "settled session, same signals",
    from: 90,
    signals: {
      lookupRate: 0.3,
      engaged: true,
      quizScore: 0,
      rating: "too-hard",
      sessionCount: 10,
    },
    expect: (d) => d >= -8.001 && d < 0,
    expectation: "down, but capped at 8",
  },
];

let failures = 0;

for (const c of CASES) {
  const after = nextLevel(c.from, c.signals);
  const delta = after - c.from;
  const ok = c.expect(delta);
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${c.name.padEnd(46)} ` +
      `${c.from} -> ${after.toFixed(1).padStart(5)}  (${delta >= 0 ? "+" : ""}${delta.toFixed(1)})` +
      `${ok ? "" : `  expected ${c.expectation}`}`,
  );
}

// The escape hatch is a full-size jump, not another nudge.
for (const [from, dir, cmp] of [
  [90, "easier", (d: number) => d <= -15],
  [20, "harder", (d: number) => d >= 15],
] as const) {
  const after = overrideLevel(from, dir);
  const delta = after - from;
  const ok = cmp(delta);
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${`override "${dir}"`.padEnd(46)} ` +
      `${from} -> ${after.toFixed(1).padStart(5)}  (${delta >= 0 ? "+" : ""}${delta.toFixed(1)})`,
  );
}

console.log(failures ? `\n${failures} failing` : "\ncalibration behaves as expected");
process.exit(failures ? 1 : 0);
