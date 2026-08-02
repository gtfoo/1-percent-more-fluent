/**
 * Smoke-test the text models outside Next, so failures surface as errors rather
 * than as a request that never returns.
 *
 *   npx tsx scripts/probe-llm.ts                          # list + probe the chain
 *   npx tsx scripts/probe-llm.ts anthropic:claude-haiku-4-5 openai:gpt-4.1-mini
 *
 * Lists the models each configured key actually grants, then runs the real
 * structured-output call against each one. Listing matters more than it looks:
 * a model id that does not exist for your account fails as a 404 mid-generation,
 * and the chain is only worth what its ids are worth.
 */
import { readFileSync } from "node:fs";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  formatRef,
  getConfiguredChain,
  hasKey,
  keyVarFor,
  parseModelRef,
  type ModelRef,
  type ProviderId,
} from "../src/server/llm";

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

// --- What each key actually grants ------------------------------------------

async function listGoogle(): Promise<string[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`,
  );
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    models: { name: string; supportedGenerationMethods?: string[] }[];
  };
  return data.models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace("models/", ""));
}

async function listOpenai(): Promise<string[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = (await res.json()) as { data: { id: string }[] };
  return data.data.map((m) => m.id).sort();
}

async function listAnthropic(): Promise<string[]> {
  const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = (await res.json()) as { data: { id: string }[] };
  return data.data.map((m) => m.id);
}

const LISTERS: Record<ProviderId, () => Promise<string[]>> = {
  google: listGoogle,
  anthropic: listAnthropic,
  openai: listOpenai,
};

async function listAll() {
  for (const provider of Object.keys(LISTERS) as ProviderId[]) {
    if (!hasKey(provider)) {
      console.log(`\n=== ${provider} === no ${keyVarFor(provider)}; skipped`);
      continue;
    }
    try {
      const ids = await LISTERS[provider]();
      console.log(`\n=== ${provider} === ${ids.length} models`);
      console.log(ids.join("\n"));
    } catch (err) {
      console.log(
        `\n=== ${provider} === list failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`,
      );
    }
  }
}

// --- Does the real call work? -----------------------------------------------

async function probe(ref: ModelRef) {
  const label = formatRef(ref);
  if (!hasKey(ref.provider)) {
    console.log(`\n--- ${label} --- skipped, no ${keyVarFor(ref.provider)}`);
    return;
  }

  console.log(`\n--- ${label} ---`);
  const started = Date.now();
  try {
    const { output } = await generateText({
      model: await modelFor(ref),
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
  await listAll();

  const args = process.argv.slice(2);
  const refs = args.length ? args.map(parseModelRef) : getConfiguredChain();

  console.log(`\nprobing: ${refs.map(formatRef).join(", ")}`);
  for (const ref of refs) await probe(ref);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
