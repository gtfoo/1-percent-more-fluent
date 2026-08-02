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
import { generateText, Output } from "ai";
import { pieceSchema, buildPrompt } from "../src/server/generate";
import { paramsFor } from "../src/lib/level";
import { DEFAULT_LANGUAGE, getLanguage } from "../src/lib/languages";
import { measure, BUDGET_SLACK } from "../src/server/difficulty";
import {
  acceptsTemperature,
  formatRef,
  getConfiguredChain,
  hasKey,
  keyVarFor,
  parseModelRef,
  type ModelRef,
} from "../src/server/llm";

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

// Imported lazily, after loadEnv: the AI SDK providers read their key at module
// scope, so importing them before .env.local is applied gets an unset key.
async function modelFor(ref: ModelRef) {
  switch (ref.provider) {
    case "google":
      return (await import("@ai-sdk/google")).google(ref.id);
    case "anthropic":
      return (await import("@ai-sdk/anthropic")).anthropic(ref.id);
    case "openai":
      return (await import("@ai-sdk/openai")).openai(ref.id);
  }
}

/** Benchmarked with no arguments. Bare ids are Google, per parseModelRef. */
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
async function bench(ref: ModelRef) {
  const id = formatRef(ref);
  if (!hasKey(ref.provider)) {
    console.log(`${id.padEnd(34)} skipped, no ${keyVarFor(ref.provider)}`);
    return;
  }

  const started = Date.now();
  let corrections: string[] | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { output } = await generateText({
        model: await modelFor(ref),
        prompt: buildPrompt("story", TOPIC, "short", params, corrections),
        output: Output.object({ schema: pieceSchema(params.language.name) }),
        // Matches generateStructured: the newer Anthropic models 400 on it.
        temperature: acceptsTemperature(ref) ? 0.8 : undefined,
        maxRetries: 0,
      });
      const report = measure(output.paragraphs.join("\n\n"), params);
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);

      console.log(
        `${id.padEnd(34)} try${attempt}${elapsed.padStart(6)}s  ` +
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
        `${id.padEnd(34)} try${attempt}${((Date.now() - started) / 1000).toFixed(1)}s  ERROR: ${
          err instanceof Error ? err.message.split("\n")[0]!.slice(0, 80) : String(err)
        }`,
      );
      return;
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  // `--chain` benchmarks exactly what the app would run, in order.
  const refs =
    args[0] === "--chain"
      ? getConfiguredChain()
      : (args.length ? args : CANDIDATES).map(parseModelRef);

  console.log(
    `Prompt: short story, level ${params.level.toFixed(0)} (${params.label}), band ${params.vocabBand}, budget ${(params.newWordBudget * 100).toFixed(0)}% (fail above ${(params.newWordBudget * BUDGET_SLACK * 100).toFixed(0)}%)\n`,
  );
  for (const ref of refs) await bench(ref);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
