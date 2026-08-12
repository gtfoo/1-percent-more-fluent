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
import { nextLevel, overrideLevel, paramsFor, type SessionSignals } from "../src/lib/level";
import { measure, BUDGET_SLACK, BUDGET_FLOOR } from "../src/server/difficulty";
import { getLanguage } from "../src/lib/languages";
import { blendReadback } from "../src/app/api/placement/route";

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
    // The exact session that exposed the runaway: 1.2% lookups and a perfect
    // quiz, rated just-right, moved the level +9 because the two correlated
    // signals were summed and then amplified.
    name: "the +9 session: low lookups, perfect quiz, rated just-right",
    from: 75,
    signals: {
      lookupRate: 0.012,
      engaged: true,
      quizScore: 1,
      rating: "just-right",
      sessionCount: 1,
    },
    expect: (d) => d > 0 && d <= 4,
    expectation: "a small nudge up, not +9",
  },
  {
    // The runaway's last escape route. Even a perfect session must not raise
    // the level if the piece never reached the difficulty it claimed.
    name: "breezed through, but the piece undershot its own level",
    from: 75,
    signals: {
      lookupRate: 0,
      engaged: true,
      quizScore: 1,
      sessionCount: 5,
      pieceUndershot: true,
    },
    expect: (d) => d <= 0,
    expectation: "no upward movement",
  },
  {
    name: "undershooting piece can still move the level DOWN",
    from: 75,
    signals: {
      lookupRate: 0.3,
      engaged: true,
      quizScore: 0,
      rating: "too-hard",
      sessionCount: 5,
      pieceUndershot: true,
    },
    expect: (d) => d < 0,
    expectation: "down",
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

// --- The difficulty floor ---------------------------------------------------
// The runaway's real cause: above ~B1 the band stops constraining the model, so
// text that is trivially inside the band sailed through and the reader looked
// nothing up. Text far under budget must now fail just as text over it does.
console.log("\n--- difficulty floor ---");
{
  // Spanish explicitly: the sample text below is Spanish, so measuring it
  // against any other language's frequency list would prove nothing.
  const params = paramsFor(85, getLanguage("es"));
  // Only the commonest words, repeated - nothing a learner could not read.
  // Long enough to clear MIN_WORDS_FOR_FLOOR: the floor deliberately ignores
  // short texts, so a short sample here would pass for the wrong reason.
  const tooEasy = ("El hombre come pan y bebe agua en la casa con su madre. " +
    "Ella dice que hoy es un buen día para ver a los amigos. ").repeat(7);
  const report = measure(tooEasy, params);
  const ok = !report.passes && report.problems.some((p) => /too easy/i.test(p));
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${"trivially in-band text at level 85".padEnd(46)} ` +
      `${(report.outOfBandRate * 100).toFixed(1)}% out-of-band, budget ${(params.newWordBudget * 100).toFixed(0)}%  ` +
      `-> ${report.passes ? "PASSED (should not)" : "rejected"}`,
  );
}

// --- The tolerance is asymmetric, on purpose ---------------------------------
// Given a piece that misses its budget, the owner would rather read one
// slightly too hard than one slightly too easy: a hard piece costs some taps,
// an easy one teaches nothing and quietly ratchets the level upward. Nothing
// enforced that, so a later tidy-up could have symmetrised the two constants
// and undone the decision without a single test going red.
console.log("\n--- the ceiling is loose and the floor is not ---");
{
  const checks: [string, boolean, string][] = [
    [
      // Measured as DRIFT FROM budget, not as a ratio of the two limits. The
      // out-of-band rate is bounded below by zero, so "x2.25 up" and "x0.4
      // down" are not comparable as multiples: down can only ever travel one
      // budget's worth, up is unbounded. At level 10 the budget is 9.5%, and
      // these limits are +11.9 and -5.7 points.
      "harder than budget drifts further than easier does",
      BUDGET_SLACK - 1 > 1 - BUDGET_FLOOR,
      `+${(BUDGET_SLACK - 1).toFixed(2)} budgets up vs -${(1 - BUDGET_FLOOR).toFixed(2)} down`,
    ],
    ["...but not so loose it accepts anything", BUDGET_SLACK < 3, `x${BUDGET_SLACK}`],
    [
      "the floor still rejects text well under budget",
      BUDGET_FLOOR > 0 && BUDGET_FLOOR <= 0.5,
      `x${BUDGET_FLOOR}`,
    ],
  ];

  // The concrete consequence, so those ratios are not abstract: a piece landing
  // at twice its budget is now READ rather than regenerated, which is the
  // latency win. Anything wilder still costs the second call.
  const params = paramsFor(10, getLanguage("es"));
  const accepts = (rate: number) => rate <= params.newWordBudget * BUDGET_SLACK;
  checks.push(
    [
      "twice the budget is accepted, not regenerated",
      accepts(params.newWordBudget * 2),
      `${(params.newWordBudget * 200).toFixed(1)}% out-of-band at level 10`,
    ],
    [
      "four times it is still rejected",
      !accepts(params.newWordBudget * 4),
      `${(params.newWordBudget * 400).toFixed(1)}%`,
    ],
  );

  for (const [what, ok, detail] of checks) {
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${what.padEnd(52)} ${detail}`);
  }
}

// --- Read-back asymmetry ----------------------------------------------------
// It must pull down hard and up only weakly: over-claiming is the common
// failure, and a flat blend took a word test of 55 up to a stored 75.
console.log("\n--- read-back blend ---");
for (const [test, readback, cmp, what] of [
  [55, 85, (v: number) => v <= 65, "claims much higher than the word test"],
  [96, 10, (v: number) => v <= 35, "cannot read the easiest sample"],
  [50, 50, (v: number) => Math.abs(v - 50) < 0.001, "agrees with the word test"],
] as const) {
  const blended = blendReadback(test, readback);
  const ok = cmp(blended);
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${what.padEnd(46)} ` +
      `test ${test}, read-back ${readback} -> ${blended.toFixed(1)}`,
  );
}

console.log(failures ? `\n${failures} failing` : "\ncalibration behaves as expected");
process.exit(failures ? 1 : 0);
