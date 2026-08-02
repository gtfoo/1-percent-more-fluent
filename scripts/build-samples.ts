/**
 * Generate the graded sample paragraphs used by the read-back check.
 *
 *   npm run samples
 *
 * One short paragraph per CEFR anchor, all on the SAME topic so that what the
 * learner is comparing is difficulty and nothing else. Each is verified against
 * the difficulty checker before being kept.
 *
 * These are committed rather than generated at runtime. A learner who has just
 * been handed a wrong estimate should not then wait 30 seconds to correct it,
 * and the check is worthless if it costs money every time someone takes the
 * test. Rebuild only when the level model changes.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { generateStructured } from "../src/server/llm";
import { measure } from "../src/server/difficulty";
import { paramsFor } from "../src/lib/level";
import { DEFAULT_LANGUAGE, getLanguage } from "../src/lib/languages";

/** `LANGUAGE=zh-CN npm run samples` builds the set for another language. */
const LANGUAGE = getLanguage(process.env.LANGUAGE ?? DEFAULT_LANGUAGE);

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

const OUT_DIR = join("src", "data", "es");

/**
 * Evenly spread across the scale so each sample is clearly a step up, and each
 * on a DIFFERENT everyday topic.
 *
 * They originally shared one topic, so that difficulty would be the only thing
 * varying between them. That was a mistake: having read the easy version, you
 * already know what the hard one says, and context carries you through text you
 * could not actually decode. The check inflated exactly the estimate it exists
 * to correct. Different topics cost a little comparability and buy back an
 * honest answer.
 */
const ANCHORS: { level: number; topic: string }[] = [
  { level: 10, topic: "what someone does on an ordinary weekday morning" },
  { level: 28, topic: "a neighbour's dog that keeps escaping from the garden" },
  { level: 47, topic: "why a small family bakery decided to close after forty years" },
  { level: 66, topic: "how a city changed after the old railway line was removed" },
  { level: 85, topic: "an argument between two friends about whether to move abroad" },
];

const TARGET_WORDS = 60;
const MAX_ATTEMPTS = 3;

const SampleSchema = z.object({
  text: z.string().describe("A single paragraph of Spanish. No title, no notes."),
});

async function buildOne(level: number, topic: string) {
  const params = paramsFor(level, LANGUAGE);
  let corrections: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { object } = await generateStructured({
      schema: SampleSchema,
      system:
        "You write graded reading samples for learners of Spanish. Natural, idiomatic Spanish that stays strictly inside the difficulty budget you are given.",
      prompt: [
        `Write ONE paragraph of about ${TARGET_WORDS} words in Spanish about ${topic}.`,
        "",
        `Difficulty budget:`,
        `- Vocabulary: draw from the ${params.vocabBand.toLocaleString()} most common Spanish words. At most ${Math.round(params.newWordBudget * 100)}% may fall outside that set.`,
        `- Sentences: average about ${params.sentenceWords} words.`,
        `- Grammar: restrict yourself to ${params.allowedGrammar.join("; ")}.`,
        "- Prefer the plainer everyday synonym whenever there is a choice.",
        ...(corrections.length
          ? ["", "Your previous attempt broke the budget. Fix:", ...corrections.map((c) => `- ${c}`)]
          : []),
      ].join("\n"),
      temperature: 0.7,
    });

    const report = measure(object.text, params);
    const status = report.passes ? "PASS" : "fail";
    console.log(
      `  ${params.label} level ${level} try${attempt} ${status}  ` +
        `${report.totalWords}w  ${(report.outOfBandRate * 100).toFixed(1)}% out-of-band  ` +
        `sent=${report.meanSentenceWords.toFixed(1)}`,
    );

    if (report.passes || attempt === MAX_ATTEMPTS) {
      return {
        level,
        topic,
        label: params.label,
        vocabBand: params.vocabBand,
        text: object.text.trim(),
        outOfBandRate: report.outOfBandRate,
        passes: report.passes,
      };
    }
    corrections = report.problems;
  }
  throw new Error("unreachable");
}

async function main() {
  console.log(`Generating ${ANCHORS.length} graded samples, one topic each:\n`);
  const samples = [];
  for (const anchor of ANCHORS) {
    samples.push(await buildOne(anchor.level, anchor.topic));
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    join(OUT_DIR, "samples.json"),
    JSON.stringify({ samples }, null, 2),
  );

  console.log(`\nWrote ${OUT_DIR}/samples.json`);
  for (const s of samples) {
    console.log(`\n--- ${s.label} (level ${s.level}) ---\n${s.text}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
