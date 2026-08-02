/**
 * The single place the text model is chosen.
 *
 * Built on the Vercel AI SDK so swapping labs is a config change:
 *
 *   LLM_MODELS   ordered fallback chain, tried left to right when one hits its
 *                quota. Each entry may name its own provider:
 *
 *                  google:gemini-3.5-flash,anthropic:claude-haiku-4-5
 *
 *                A bare id (no colon) uses LLM_PROVIDER, default "google", so
 *                the older single-provider form still works unchanged.
 *   LLM_PROVIDER provider for unqualified ids. google | anthropic | openai.
 *   LLM_MODEL    single-model fallback if LLM_MODELS is unset.
 *
 * The chain crosses providers deliberately. A quota is per-provider, so a
 * chain of three Gemini models all fail together the moment the daily free-tier
 * limit is hit - which is exactly what happened, and what took generation down
 * mid-session. A chain that changes lab actually survives it.
 *
 * Text generation is the cheap half of this product - a 400-word story is
 * roughly 600 output tokens - so the chain exists to survive rate limits, not
 * to save money. The expensive half is speech; see tts.ts.
 */
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import type { z } from "zod";

export type ProviderId = "google" | "anthropic" | "openai";

export interface ModelRef {
  provider: ProviderId;
  id: string;
}

/** The env var each provider's SDK reads. Presence is how we know it is usable. */
const API_KEY_VAR: Record<ProviderId, string> = {
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

const PROVIDERS = Object.keys(API_KEY_VAR) as ProviderId[];

function isProvider(value: string): value is ProviderId {
  return (PROVIDERS as string[]).includes(value);
}

export function hasKey(provider: ProviderId): boolean {
  return Boolean(process.env[API_KEY_VAR[provider]]);
}

/** The env var a provider needs, for error messages that can actually be acted on. */
export function keyVarFor(provider: ProviderId): string {
  return API_KEY_VAR[provider];
}

function resolveModel(ref: ModelRef): LanguageModel {
  switch (ref.provider) {
    case "google":
      return google(ref.id);
    case "anthropic":
      return anthropic(ref.id);
    case "openai":
      return openai(ref.id);
  }
}

/**
 * Anthropic removed the sampling parameters on its newer models: sending
 * `temperature` to Opus 5, Sonnet 5, Fable 5 or Opus 4.7/4.8 is a 400, not a
 * silently ignored field. Haiku 4.5 and the 4.6 generation still accept it.
 *
 * Listing what still works, rather than what does not, is the safer direction:
 * a model released after this was written is assumed strict and simply loses
 * the temperature, instead of failing every request outright.
 */
const ANTHROPIC_ACCEPTS_TEMPERATURE = /^claude-(haiku-4-5|sonnet-4-6|opus-4-6|opus-4-5|haiku-3)/;

export function acceptsTemperature(ref: ModelRef): boolean {
  if (ref.provider !== "anthropic") return true;
  return ANTHROPIC_ACCEPTS_TEMPERATURE.test(ref.id);
}

/** `"anthropic:claude-haiku-4-5"` -> `{provider, id}`; a bare id uses the default. */
export function parseModelRef(entry: string): ModelRef {
  const fallback = process.env.LLM_PROVIDER ?? "google";
  const defaultProvider: ProviderId = isProvider(fallback) ? fallback : "google";

  const colon = entry.indexOf(":");
  if (colon <= 0) return { provider: defaultProvider, id: entry.trim() };

  const prefix = entry.slice(0, colon).trim();
  // Only treat the prefix as a provider if it actually names one - a model id
  // that happens to contain a colon must not be silently truncated.
  if (!isProvider(prefix)) return { provider: defaultProvider, id: entry.trim() };

  return { provider: prefix, id: entry.slice(colon + 1).trim() };
}

/**
 * The default chain, most-preferred first.
 *
 * Gemini leads on measurement: `scripts/bench-models.ts` times the real prompt
 * and schema, and gemini-3.5-flash returns a full piece in 10-12s where
 * gemini-flash-latest ranged from 16s to over two minutes under load. The other
 * two are there for when Google's daily free-tier quota is gone, and are
 * ordered cheapest-first because at this volume any of them is a rounding
 * error next to the speech bill.
 *
 * The OpenAI id is deliberately left to configuration: unlike the Anthropic
 * ids, it was not verified against a live account, and a wrong id is a 404 at
 * the worst possible moment. `npm run models` lists what a key actually grants;
 * put the chosen id in LLM_MODELS.
 */
const DEFAULT_CHAIN: ModelRef[] = [
  { provider: "google", id: "gemini-3.5-flash" },
  { provider: "google", id: "gemini-flash-latest" },
  { provider: "anthropic", id: "claude-haiku-4-5" },
  { provider: "anthropic", id: "claude-sonnet-5" },
];

/** Every model the config asks for, before any key filtering. */
export function getConfiguredChain(): ModelRef[] {
  const chain = process.env.LLM_MODELS;
  if (chain) {
    const refs = chain.split(",").map((s) => s.trim()).filter(Boolean).map(parseModelRef);
    if (refs.length) return refs;
  }
  if (process.env.LLM_MODEL) return [parseModelRef(process.env.LLM_MODEL)];
  return DEFAULT_CHAIN;
}

/**
 * The chain actually worth trying: entries whose provider has a key.
 *
 * Filtering here rather than letting the request fail matters. A missing key
 * surfaces as an auth error, which `shouldFallback` treats as retryable, so an
 * unconfigured provider in the middle of the chain would burn a real attempt
 * and muddy the logs on every single generation.
 */
export function getModelChain(): ModelRef[] {
  return getConfiguredChain().filter((ref) => hasKey(ref.provider));
}

/** Providers named in the chain that are missing their key. */
export function missingKeys(): ProviderId[] {
  const wanted = new Set(getConfiguredChain().map((r) => r.provider));
  return [...wanted].filter((p) => !hasKey(p));
}

export function isLlmConfigured(): boolean {
  return getModelChain().length > 0;
}

/** For logs and the `model` column: "anthropic:claude-haiku-4-5". */
export function formatRef(ref: ModelRef): string {
  return `${ref.provider}:${ref.id}`;
}

/**
 * Errors where retrying with a DIFFERENT model is sensible: a hit quota, an
 * overloaded lab, or the model being unavailable for this key. A genuine bad
 * request (bad prompt or schema) is not retried - it would fail on every model.
 *
 * The vocabulary is deliberately cross-provider: Google says
 * "RESOURCE_EXHAUSTED", Anthropic returns 529 "overloaded_error", OpenAI says
 * "insufficient_quota".
 */
function shouldFallback(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /quota|rate.?limit|429|resource.?exhausted|exhausted|not found|no longer available|404|unavailable|overloaded|529|permission|403|401|authentication/i.test(
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
  const chain = getModelChain();
  if (!chain.length) {
    const wanted = missingKeys().map((p) => API_KEY_VAR[p]).join(", ");
    throw new Error(
      `No text model is configured. Set ${wanted || "GOOGLE_GENERATIVE_AI_API_KEY"} in .env.local.`,
    );
  }

  let lastErr: unknown;

  for (let i = 0; i < chain.length; i++) {
    const ref = chain[i]!;
    try {
      const { output } = await generateText({
        model: resolveModel(ref),
        system: args.system,
        prompt: args.prompt,
        // Omitted rather than clamped where the provider rejects it: a model
        // that will not take a temperature should run at its own default, not
        // at a value we invented.
        temperature: acceptsTemperature(ref) ? args.temperature : undefined,
        output: Output.object({ schema: args.schema }),
      });
      return { object: output as T, modelId: formatRef(ref) };
    } catch (err) {
      lastErr = err;
      const hasNext = i < chain.length - 1;
      if (hasNext && shouldFallback(err)) {
        console.warn(
          `LLM model "${formatRef(ref)}" unavailable (${
            err instanceof Error ? err.message.split("\n")[0] : String(err)
          }); falling back to "${formatRef(chain[i + 1]!)}".`,
        );
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
