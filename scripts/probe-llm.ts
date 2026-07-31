/**
 * Smoke-test the text model outside Next, so failures surface as errors rather
 * than as a request that never returns.
 *
 *   npx tsx scripts/probe-llm.ts
 */
import { readFileSync } from "node:fs";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";

function loadEnv(path = ".env.local") {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
    }
  } catch {
    /* rely on ambient env */
  }
}
loadEnv();

const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!key) throw new Error("no GOOGLE_GENERATIVE_AI_API_KEY");
console.log(`key present, ${key.length} chars`);

async function listModels() {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
  );
  if (!res.ok) {
    console.log(`ListModels failed: ${res.status} ${await res.text()}`);
    return;
  }
  const data = (await res.json()) as {
    models: { name: string; supportedGenerationMethods?: string[] }[];
  };
  const usable = data.models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace("models/", ""));
  console.log(`\n${usable.length} models support generateContent:`);
  console.log(usable.join("\n"));
}

async function probe(id: string) {
  console.log(`\n--- ${id} ---`);
  const started = Date.now();
  try {
    const { output } = await generateText({
      model: google(id),
      prompt: "Write a two-sentence story in Spanish about a cat.",
      output: Output.object({
        schema: z.object({ title: z.string(), body: z.string() }),
      }),
      maxRetries: 0,
    });
    console.log(`ok in ${Date.now() - started}ms:`, output);
  } catch (err) {
    console.log(`FAILED in ${Date.now() - started}ms:`);
    console.log(err instanceof Error ? err.message : String(err));
  }
}

async function main() {
  await listModels();
  for (const id of process.argv.slice(2).length
    ? process.argv.slice(2)
    : ["gemini-flash-latest"]) {
    await probe(id);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
