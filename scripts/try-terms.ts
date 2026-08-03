/**
 * One real generation, to see whether the model actually complies with the
 * topic-term contract.
 *
 *   LLM_MODELS=google:gemini-3.5-flash npx tsx scripts/try-terms.ts
 *   LEVEL=45 LANGUAGE=zh-CN TOPIC="..." npx tsx scripts/try-terms.ts
 *
 * Everything else about protected terms is unit-tested against fixtures, which
 * cannot answer the only question left: does the model pick terms a person
 * would actually need, use all of them, and keep them under the cap? That needs
 * a real call, so this makes exactly one and prints what came back.
 *
 * Calls generatePiece directly rather than going through HTTP so the level and
 * language are set explicitly, instead of depending on whatever profile happens
 * to be in the database.
 */
import { readFileSync } from "node:fs";

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

async function main() {
  // Imported after loadEnv: the AI SDK providers read their key at module scope.
  const { generatePiece } = await import("../src/server/generate");
  const { getLanguage } = await import("../src/lib/languages");
  const { paramsFor } = await import("../src/lib/level");
  const { getModelChain, formatRef } = await import("../src/server/llm");

  const level = Number(process.env.LEVEL ?? 45);
  const language = getLanguage(process.env.LANGUAGE ?? "zh-CN");
  const topic = process.env.TOPIC ?? "explaining payment terms to a client";
  const params = paramsFor(level, language);

  console.log(`chain   : ${getModelChain().map(formatRef).join(" -> ") || "(nothing configured)"}`);
  console.log(
    `asking  : ${language.name}, level ${level} (${params.label}), band ${params.vocabBand.toLocaleString()}, budget ${(params.newWordBudget * 100).toFixed(0)}%`,
  );
  console.log(`topic   : ${topic}\n`);

  const { id, piece, report, modelId, attempts } = await generatePiece({
    userId: "try-terms",
    level,
    format: "conversation",
    topic,
    language,
    length: "short",
  });

  console.log(`[${modelId}] ${attempts} attempt(s)  piece ${id}`);
  console.log(`"${piece.title}"\n`);

  console.log(`--- the ${piece.terms.length} terms it chose ---`);
  for (const t of piece.terms) {
    // Whether a declared term is actually in the text is the contract; show it
    // per-term rather than only in the aggregate problem list.
    const used = piece.paragraphs.join("\n").includes(t.term);
    console.log(`${used ? "  used  " : "  ABSENT"} ${t.term} - ${t.meaning}`);
  }

  console.log("\n--- measurement ---");
  console.log(`  ${report.totalWords} words, mean sentence ${report.meanSentenceWords.toFixed(1)}`);
  console.log(
    `  out-of-band ${(report.outOfBandRate * 100).toFixed(1)}% (budget ${(params.newWordBudget * 100).toFixed(0)}%)  ` +
      `terms ${(report.termRate * 100).toFixed(0)}% of text  passes=${report.passes}`,
  );
  if (report.problems.length) {
    for (const p of report.problems) console.log(`  problem: ${p}`);
  }

  console.log("\n--- the text ---");
  for (const p of piece.paragraphs) console.log(p);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
