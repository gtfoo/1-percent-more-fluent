/**
 * The single place the text model is chosen.
 *
 * Built on the Vercel AI SDK so swapping labs is a config change:
 *
 *   LLM_PROVIDER  google (default)
 *   LLM_MODELS    ordered, comma-separated fallback chain, e.g.
 *                 "gemini-flash-latest,gemini-2.5-flash". When the first model
 *                 hits its free-tier quota, the next is tried automatically.
 *   LLM_MODEL     single-model fallback if LLM_MODELS is unset.
 *
 * Text generation is the cheap half of this product - a 400-word story is
 * roughly 600 output tokens - so the fallback chain exists to survive free-tier
 * rate limits, not to save money. The expensive half is speech; see tts.ts.
 */
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import type { z } from "zod";

function resolveModel(id: string): LanguageModel {
  const provider = process.env.LLM_PROVIDER ?? "google";
  switch (provider) {
    case "google":
      return google(id);
    default:
      throw new Error(
        `Unknown LLM_PROVIDER "${provider}". Add a case in src/server/llm.ts.`,
      );
  }
}

/** The ordered list of model ids to try, most-preferred first. */
export function getModelIds(): string[] {
  const chain = process.env.LLM_MODELS;
  if (chain) {
    const ids = chain.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length) return ids;
  }
  if (process.env.LLM_MODEL) return [process.env.LLM_MODEL];

  // Measured on this app's actual prompt and schema (scripts/bench-models.ts):
  // gemini-3.5-flash returns a full piece in 10-12s, where gemini-flash-latest
  // ranged from 16s to over two minutes under load. "latest" stays in the chain
  // as a fallback so the app survives 3.5-flash being unavailable.
  return ["gemini-3.5-flash", "gemini-flash-latest"];
}

export function isLlmConfigured(): boolean {
  const provider = process.env.LLM_PROVIDER ?? "google";
  if (provider === "google") {
    return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  }
  return true;
}

/**
 * Errors where retrying with a DIFFERENT model is sensible: a hit free-tier
 * quota, or the model being unavailable for this key. A genuine bad request
 * (bad prompt or schema) is not retried - it would fail on every model.
 */
function shouldFallback(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /quota|rate.?limit|429|resource.?exhausted|exhausted|not found|no longer available|404|unavailable|permission|403/i.test(
    m,
  );
}

/**
 * Structured generation with automatic fallback down the model chain.
 *
 * Uses `generateText` with a typed `output`, which is the current AI SDK API -
 * `generateObject` still exists but is deprecated in v6.
 */
export async function generateStructured<T>(args: {
  schema: z.ZodType<T>;
  system?: string;
  prompt: string;
  temperature?: number;
}): Promise<{ object: T; modelId: string }> {
  const ids = getModelIds();
  let lastErr: unknown;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    try {
      const { output } = await generateText({
        model: resolveModel(id),
        system: args.system,
        prompt: args.prompt,
        temperature: args.temperature,
        output: Output.object({ schema: args.schema }),
      });
      return { object: output as T, modelId: id };
    } catch (err) {
      lastErr = err;
      const hasNext = i < ids.length - 1;
      if (hasNext && shouldFallback(err)) {
        console.warn(
          `LLM model "${id}" unavailable (${
            err instanceof Error ? err.message : String(err)
          }); falling back to "${ids[i + 1]}".`,
        );
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
