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
 * Text generation is the cheap half of this product, so the chain exists to
 * survive rate limits, not to save money. The expensive half is speech; see
 * tts.ts.
 *
 * A piece is ~2,500-3,300 OUTPUT tokens, measured from production usage lines,
 * not the ~600 the prose alone suggests - the schema also carries the
 * glossary, the quiz and the key terms, and they are half the emission. Size
 * rate-limit and cost arithmetic from the measured figure; an earlier comment
 * here said 600 and was wrong by a factor of five.
 */
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateText, streamText, Output } from "ai";
import type { LanguageModel } from "ai";
import type { z } from "zod";
import { recordUsage, usageStatusFor } from "./usage";

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
 * The default chain, most-preferred first: Google, then Anthropic, then OpenAI.
 *
 * Gemini leads on measurement - `scripts/bench-models.ts` times the real prompt
 * and schema - and because its free tier makes it the cheapest thing to try
 * first. But that free tier is 20 requests per day PER MODEL, so the two Google
 * entries are one bad afternoon apart from both being gone; everything after
 * them exists for that moment, which has already happened twice.
 *
 * Cheapest first within each lab. At this volume the whole chain is a rounding
 * error next to the speech bill, so the ordering is about latency and headroom
 * rather than cost.
 *
 * Every id here was listed and then actually called via `npm run models`
 * against a live account. That matters more than it sounds: the Anthropic
 * models endpoint reports Haiku as the dated `claude-haiku-4-5-20251001`, so
 * the bare alias below looks wrong until you call it and it resolves.
 */
const DEFAULT_CHAIN: ModelRef[] = [
  { provider: "google", id: "gemini-3.5-flash" },
  { provider: "google", id: "gemini-flash-latest" },
  { provider: "anthropic", id: "claude-haiku-4-5" },
  { provider: "anthropic", id: "claude-sonnet-5" },
  { provider: "openai", id: "gpt-5-mini" },
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
 * empty account, an overloaded lab, or the model being unavailable for this
 * key. A genuine bad request (bad prompt or schema) is not retried - it would
 * fail on every model.
 *
 * The vocabulary is deliberately cross-provider, because each lab words the
 * same condition differently. Google says "RESOURCE_EXHAUSTED", Anthropic
 * returns 529 "overloaded_error", and OpenAI - the one that caught this out -
 * says "You have no credits remaining", which matches none of the quota
 * wording and would have stopped the chain dead on a provider that simply
 * needs topping up. `scripts/check-llm-chain.ts` pins the real strings.
 *
 * The transient-overload wording is the other half, and it cost a generation to
 * find: Google says "This model is currently experiencing high demand. Spikes in
 * demand are usually temporary", which contains no code, no "overloaded" and no
 * "quota", so the chain stopped dead on it. It used to be invisible because the
 * SDK retried three times and usually rode it out - so removing those retries
 * and not widening this at the same time would have traded a slow generation for
 * a failed one.
 */
export function shouldFallback(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /quota|rate.?limit|429|resource.?exhausted|exhausted|credit|billing|insufficient|not found|no longer available|404|unavailable|overloaded|529|permission|403|401|authentication|high demand|spikes in demand|temporarily|try again later|capacity|503/i.test(
    m,
  );
}

/**
 * How hard to try one model before moving to the next.
 *
 * Zero while there is somewhere to fall back to, and this is worth the
 * explanation. The SDK retries three times by default, which is right when a
 * model is the only option and wrong when it is not: the failure this chain
 * exists for is an exhausted quota, and a quota does not recover in the two
 * seconds between attempts. Measured, with the free tier spent: 20 seconds of
 * retries before the fallback model was even asked - which then produced the
 * whole piece in under a second. Every generation for the rest of the day paid
 * that, on the streaming route and the plain one alike.
 *
 * The last model in the chain keeps the retries. By then there is nothing to
 * fall through to, so riding out a transient blip is the only thing left.
 */
function retriesFor(hasNext: boolean): number {
  return hasNext ? 0 : 2;
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
  /** Labels the line in the spend log. */
  op?: string;
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
      const { output, usage, response } = await generateText({
        model: resolveModel(ref),
        maxRetries: retriesFor(i < chain.length - 1),
        system: args.system,
        prompt: args.prompt,
        // Omitted rather than clamped where the provider rejects it: a model
        // that will not take a temperature should run at its own default, not
        // at a value we invented.
        temperature: acceptsTemperature(ref) ? args.temperature : undefined,
        output: Output.object({ schema: args.schema }),
      });
      recordUsage({
        provider: ref.provider,
        // What answered, not what was asked for: `gemini-flash-latest` is a
        // moving target and its limits move with it, so a change in behaviour
        // is only diagnosable if the resolved name was written down.
        model: response.modelId || ref.id,
        op: args.op ?? "generate",
        in_tokens: usage.inputTokens ?? null,
        out_tokens: usage.outputTokens ?? null,
        // Null, not zero. Nobody has measured what a call costs here, and the
        // primary is a free tier where zero would be a lie of a different kind.
        usd: null,
      });
      return { object: output as T, modelId: formatRef(ref) };
    } catch (err) {
      lastErr = err;
      // Recorded even though it produced nothing. A refusal is the most useful
      // line in the file: on a free tier it is the only honest evidence of
      // where the ceiling actually is.
      recordUsage({
        provider: ref.provider,
        model: ref.id,
        op: args.op ?? "generate",
        status: usageStatusFor(err),
      });
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

/**
 * The same, handing back the object as it is built rather than when it is done.
 *
 * A piece takes about twenty seconds to generate, and roughly half of that is
 * spent emitting things the reader is not waiting for - the glossary, the quiz.
 * The model emits fields in schema order and the body comes second, so a reader
 * who can see partial output starts reading at about two seconds instead of
 * twenty. Nothing about the request changes; the same tokens are billed.
 *
 * FALLBACK ONLY HAPPENS BEFORE THE FIRST CHUNK. Once output has started the
 * response is committed - switching models mid-piece would splice two different
 * texts together - so the first partial is pulled here, inside the retry loop,
 * and only then is the stream handed over. That is exactly where the failures
 * this chain exists for occur anyway: a quota refusal arrives instead of a first
 * chunk, not halfway through one.
 */
export async function streamStructured<T>(args: {
  schema: z.ZodType<T>;
  system?: string;
  prompt: string;
  temperature?: number;
  /** Labels the line in the spend log. */
  op?: string;
}): Promise<{
  partials: AsyncIterable<unknown>;
  object: PromiseLike<T>;
  modelId: string;
}> {
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
      // A streaming call does not throw when the model refuses. The rejection
      // arrives here instead, and the iterator simply ends without yielding -
      // so a quota error looks identical to a model that finished early, and
      // the only symptom downstream is the SDK's "No output generated", which
      // names neither the model nor the cause. Captured so the check below can
      // rethrow the real thing and let the chain do its job.
      let streamError: unknown;
      const result = streamText({
        model: resolveModel(ref),
        maxRetries: retriesFor(i < chain.length - 1),
        system: args.system,
        prompt: args.prompt,
        temperature: acceptsTemperature(ref) ? args.temperature : undefined,
        output: Output.object({ schema: args.schema }),
        onError({ error }) {
          streamError = error;
        },
      });

      // Pull the first partial here, so a model that refuses outright is caught
      // while falling back is still possible.
      const began = Date.now();
      const iterator = result.partialOutputStream[Symbol.asyncIterator]();
      const first = await iterator.next();
      // The number that decides whether streaming is worth anything on a given
      // provider: how long before there is something to put on screen. If it
      // lands near the total generation time, that provider is buffering and the
      // reader gains nothing.
      console.log(
        `LLM ${formatRef(ref)}: first partial after ${Date.now() - began}ms`,
      );

      // No output at all. A working generation always yields at least one
      // partial, so this is a refusal wearing a clean exit - rethrow it as the
      // error it is, and the chain below falls through to the next model
      // exactly as it does for the non-streaming call.
      if (first.done) {
        throw (
          streamError ??
          new Error(`Model "${formatRef(ref)}" produced no output.`)
        );
      }

      // Only once the stream has finished are the totals known, so this settles
      // long after the caller has its result. Detached deliberately - the
      // reader is not waiting on bookkeeping.
      void Promise.all([result.usage, result.response])
        .then(([usage, response]) => {
          recordUsage({
            provider: ref.provider,
            model: response.modelId || ref.id,
            op: args.op ?? "generate-stream",
            in_tokens: usage.inputTokens ?? null,
            out_tokens: usage.outputTokens ?? null,
            usd: null,
          });
        })
        .catch(() => {
          // The stream died mid-flight; the failure is reported to the caller
          // through `object` rejecting, and a spend line for a call we cannot
          // describe would be worse than none.
        });

      return {
        modelId: formatRef(ref),
        object: result.output as PromiseLike<T>,
        partials: {
          async *[Symbol.asyncIterator]() {
            yield first.value;
            for (;;) {
              const next = await iterator.next();
              if (next.done) return;
              yield next.value;
            }
          },
        },
      };
    } catch (err) {
      lastErr = err;
      recordUsage({
        provider: ref.provider,
        model: ref.id,
        op: args.op ?? "generate-stream",
        status: usageStatusFor(err),
      });
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
