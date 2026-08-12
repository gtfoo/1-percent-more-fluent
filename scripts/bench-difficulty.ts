/**
 * Does showing the model the word band make it hit the difficulty target?
 *
 *   npm run bench-difficulty            # plan only, spends nothing
 *   npm run bench-difficulty -- --run   # actually generate
 *
 * THE QUESTION. The prompt asks for text built from "the N most common Spanish
 * words", where N indexes a frequency list the model cannot see. It has to
 * estimate membership by feel, and at low levels there is no margin: replaying
 * 25 stored pieces showed 86% of those below level 25 missing on the first
 * attempt, against 14% between 25 and 49. Each miss costs a whole second
 * generation. The hypothesis is that pasting the band in turns guessing into
 * constraint-following, for ~1,100 input tokens against the ~600 output tokens
 * a retry costs.
 *
 * WHAT IT MEASURES. First-pass rate per (level, variant): one attempt each, no
 * retry loop, nothing written to the database. The stored reports could not
 * answer this - a stored report is the FINAL attempt, so a piece that failed
 * once and passed on the retry is recorded as passing.
 *
 * COST SAFETY. Pinned to ONE Google model. The production chain falls through
 * to Anthropic and OpenAI when Gemini's free tier is exhausted, so an unpinned
 * harness would start billing mid-run with nothing in the output to say so.
 * Prints the plan and requires --run before spending anything.
 *
 * QUOTA. Gemini's free tier is 20 requests per day per model. When it runs
 * out, the run STOPS AND REPORTS what it has rather than failing - partial
 * data with an honest sample size beats no data.
 */
import { readFileSync } from "node:fs";
import { paramsFor } from "../src/lib/level";
import { getLanguage } from "../src/lib/languages";

/**
 * Next loads .env.local for the app; a bare script does not. Same helper as
 * build-wordlist.ts. Existing variables win, so an exported key still beats
 * the file.
 */
function loadEnv(path = ".env.local") {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
    }
  } catch {
    // No .env.local is fine if the key is exported.
  }
}

/** One Google model, named explicitly. See COST SAFETY above. */
const MODEL = process.env.BENCH_MODEL ?? "google:gemini-3.5-flash";

const LEVELS = [10, 30, 50];
const SAMPLES = Number(process.env.BENCH_SAMPLES ?? 3);
const LANGUAGE = process.env.BENCH_LANGUAGE ?? "es";

/**
 * Topics fixed, not random. The variable under test is the prompt; letting the
 * topic move too would put the difference between variants partly down to
 * whichever topic happened to be drawn.
 */
const TOPICS = ["a lost key", "how a market works", "a walk by the river"];

interface Row {
  level: number;
  variant: string;
  sample: number;
  passes: boolean;
  rate: number;
  budget: number;
  ms: number;
  problems: string[];
}

function pct(n: number, of: number) {
  return of === 0 ? "  -  " : `${Math.round((100 * n) / of)}%`.padStart(5);
}

async function main() {
  const run = process.argv.includes("--run");
  const language = getLanguage(LANGUAGE);
  const calls = LEVELS.length * SAMPLES * 2;

  console.log(`model     ${MODEL}   (pinned - cannot fall through to a paid provider)`);
  console.log(`language  ${language.name}`);
  console.log(`plan      ${LEVELS.length} levels x ${SAMPLES} samples x 2 variants = ${calls} calls`);
  console.log(`          Gemini's free tier is 20/day/model.`);
  if (!run) {
    console.log("\nDry run. Nothing was generated. Add --run to spend.");
    return;
  }

  // .env.local first, then pin - the pin is a direct assignment, so it wins
  // over any LLM_MODELS in the file.
  loadEnv();
  process.env.LLM_MODELS = MODEL;
  const { draftPiece } = await import("../src/server/generate");
  const { getConfiguredChain } = await import("../src/server/llm");

  const chain = getConfiguredChain();
  if (chain.length !== 1 || chain[0]!.provider !== "google") {
    console.error(`refusing to run: chain is ${chain.map((c) => `${c.provider}:${c.id}`).join(", ")}`);
    console.error("expected exactly one google entry - a longer chain can bill a paid provider mid-run.");
    process.exit(1);
  }

  // The band, for the variant that shows it.
  const freq = (await import(`../src/data/${LANGUAGE}/frequency.json`)).default as {
    words: string[];
  };

  const rows: Row[] = [];
  let stopped = "";

  outer: for (const level of LEVELS) {
    const params = paramsFor(level, language);
    for (const [variant, vocabulary] of [
      ["current", undefined],
      ["band shown", freq.words.slice(0, params.vocabBand)],
    ] as const) {
      for (let s = 0; s < SAMPLES; s++) {
        const started = Date.now();
        try {
          const { report } = await draftPiece({
            language,
            params,
            format: "story",
            topic: TOPICS[s % TOPICS.length]!,
            length: "short",
            vocabulary,
          });
          rows.push({
            level,
            variant,
            sample: s,
            passes: report.passes,
            rate: report.outOfBandRate,
            budget: params.newWordBudget,
            ms: Date.now() - started,
            problems: report.problems,
          });
          process.stdout.write(report.passes ? "." : "x");
        } catch (err) {
          // Quota, or anything else. Keep what we have - see QUOTA above.
          stopped = err instanceof Error ? err.message : String(err);
          process.stdout.write("!");
          break outer;
        }
      }
    }
  }

  console.log("\n");
  if (stopped) {
    console.log(`STOPPED after ${rows.length} of ${calls} calls:`);
    console.log(`  ${stopped.slice(0, 200)}`);
    console.log("  Reporting what completed. Re-run later to add samples.\n");
  }
  report(rows);
}

function report(rows: Row[]) {
  if (!rows.length) return console.log("no data");

  console.log("first-pass rate, by level and variant");
  console.log("  level  variant       n   passed   median rate/budget   median s");
  for (const level of LEVELS) {
    for (const variant of ["current", "band shown"]) {
      const r = rows.filter((x) => x.level === level && x.variant === variant);
      if (!r.length) continue;
      const ratios = r.map((x) => x.rate / x.budget).sort((a, b) => a - b);
      const secs = r.map((x) => x.ms).sort((a, b) => a - b);
      console.log(
        `  ${String(level).padStart(5)}  ${variant.padEnd(12)}${String(r.length).padStart(2)}` +
          `   ${pct(r.filter((x) => x.passes).length, r.length)}` +
          `        ${ratios[Math.floor(ratios.length / 2)]!.toFixed(2)}x` +
          `          ${(secs[Math.floor(secs.length / 2)]! / 1000).toFixed(1)}`,
      );
    }
  }

  const by = (v: string) => rows.filter((x) => x.variant === v);
  const rate = (v: string) => {
    const r = by(v);
    return r.length ? Math.round((100 * r.filter((x) => x.passes).length) / r.length) : 0;
  };
  console.log("");
  console.log(`overall   current ${rate("current")}%   band shown ${rate("band shown")}%`);

  // Latency is the other half: showing the band costs input tokens on every
  // call, and only pays if it avoids more retries than it costs.
  const med = (v: string) => {
    const s = by(v).map((x) => x.ms).sort((a, b) => a - b);
    return s.length ? (s[Math.floor(s.length / 2)]! / 1000).toFixed(1) : "-";
  };
  console.log(`median s  current ${med("current")}    band shown ${med("band shown")}`);

  const worse = by("band shown").filter((x) => !x.passes && x.rate < x.budget);
  if (worse.length) {
    console.log(`\nnote: ${worse.length} band-shown pieces failed for being TOO EASY -`);
    console.log("      showing the band can push the model to stay inside it.");
  }
}

void main();
