/**
 * Time the REAL generation prompt and schema across candidate models.
 *
 * Generation latency is the whole user experience here - a learner will not
 * wait two minutes to be handed a story - so the default model chain should be
 * picked by measurement, not by reputation.
 *
 *   npx tsx scripts/bench-models.ts [modelId ...]
 */
import { readFileSync } from "node:fs";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { pieceSchema, buildPrompt } from "../src/server/generate";
import { paramsFor } from "../src/lib/level";
import { DEFAULT_LANGUAGE, getLanguage } from "../src/lib/languages";
import { measure, BUDGET_SLACK } from "../src/server/difficulty";

function loadEnv(path = ".env.local") {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
    }
  } catch {
    /* ambient env */
  }
}
loadEnv();

const CANDIDATES = [
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
];

/** `LANGUAGE=zh-CN npm run bench` benchmarks generation for another language. */
const LANGUAGE = getLanguage(process.env.LANGUAGE ?? DEFAULT_LANGUAGE);
const params = paramsFor(44.5, LANGUAGE); // a mid-B1 profile
const TOPIC = "a folk tale about a fisherman who catches a talking fish";

/**
 * Runs the same two-attempt loop the app uses, so the numbers reflect what a
 * reader actually waits for - not just a single call.
 */
async function bench(id: string) {
  const started = Date.now();
  let corrections: string[] | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { output } = await generateText({
        model: google(id),
        prompt: buildPrompt("story", TOPIC, "short", params, corrections),
        output: Output.object({ schema: pieceSchema(params.language.name) }),
        temperature: 0.8,
        maxRetries: 0,
      });
      const report = measure(output.paragraphs.join("\n\n"), params);
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);

      console.log(
        `${id.padEnd(22)} try${attempt} ${elapsed.padStart(6)}s  ` +
          `${String(report.totalWords).padStart(4)}w  ` +
          `${(report.outOfBandRate * 100).toFixed(1).padStart(5)}% out-of-band  ` +
          `sent=${report.meanSentenceWords.toFixed(1).padStart(5)}  ` +
          `gloss=${String(output.glossary.length).padStart(2)}  ` +
          `${report.passes ? "PASS" : "FAIL"}`,
      );

      if (report.passes) return;
      corrections = report.problems;
    } catch (err) {
      console.log(
        `${id.padEnd(22)} try${attempt} ${((Date.now() - started) / 1000).toFixed(1)}s  ERROR: ${
          err instanceof Error ? err.message.split("\n")[0]!.slice(0, 80) : String(err)
        }`,
      );
      return;
    }
  }
}

async function main() {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : CANDIDATES;
  console.log(
    `Prompt: short story, level ${params.level.toFixed(0)} (${params.label}), band ${params.vocabBand}, budget ${(params.newWordBudget * 100).toFixed(0)}% (fail above ${(params.newWordBudget * BUDGET_SLACK * 100).toFixed(0)}%)\n`,
  );
  for (const id of ids) await bench(id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
