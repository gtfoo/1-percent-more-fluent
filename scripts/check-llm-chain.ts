/**
 * Assert the model chain parses and filters the way the app depends on.
 *
 *   npm run chain
 *
 * Pure functions over env vars, so this costs nothing to run and catches the
 * failures that would otherwise only show up as a 404 or a 400 in the middle of
 * a real generation: a mis-split model id, a provider whose key is missing
 * being tried anyway, or a temperature sent to a model that rejects it.
 */
import {
  acceptsTemperature,
  formatRef,
  getConfiguredChain,
  getModelChain,
  missingKeys,
  parseModelRef,
  type ProviderId,
} from "../src/server/llm";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) console.log(`       expected ${e}\n       got      ${a}`);
}

/** Run `fn` with a temporary env, restoring whatever was there before. */
function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(vars)) {
    saved.set(k, process.env[k]);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const NO_KEYS = {
  GOOGLE_GENERATIVE_AI_API_KEY: undefined,
  ANTHROPIC_API_KEY: undefined,
  OPENAI_API_KEY: undefined,
  LLM_MODELS: undefined,
  LLM_MODEL: undefined,
  LLM_PROVIDER: undefined,
};

console.log("--- parsing ---");

withEnv(NO_KEYS, () => {
  check("provider-qualified", parseModelRef("anthropic:claude-haiku-4-5"), {
    provider: "anthropic",
    id: "claude-haiku-4-5",
  });

  check("bare id defaults to google", parseModelRef("gemini-3.5-flash"), {
    provider: "google",
    id: "gemini-3.5-flash",
  });

  check("whitespace is trimmed", parseModelRef("  openai:gpt-x  "), {
    provider: "openai",
    id: "gpt-x",
  });

  // The trap: a colon that is not a provider prefix must not be treated as one,
  // or the id is silently truncated and the request 404s.
  check("unknown prefix is kept whole", parseModelRef("ft:custom-model-9000"), {
    provider: "google",
    id: "ft:custom-model-9000",
  });
});

withEnv({ ...NO_KEYS, LLM_PROVIDER: "anthropic" }, () => {
  check("bare id honours LLM_PROVIDER", parseModelRef("claude-haiku-4-5"), {
    provider: "anthropic",
    id: "claude-haiku-4-5",
  });
});

withEnv({ ...NO_KEYS, LLM_PROVIDER: "nonsense" }, () => {
  check("bogus LLM_PROVIDER falls back to google", parseModelRef("x"), {
    provider: "google",
    id: "x",
  });
});

console.log("\n--- key filtering ---");

withEnv(
  {
    ...NO_KEYS,
    LLM_MODELS: "google:gemini-3.5-flash,anthropic:claude-haiku-4-5,openai:gpt-x",
    ANTHROPIC_API_KEY: "test",
  },
  () => {
    check(
      "only keyed providers are tried",
      getModelChain().map(formatRef),
      ["anthropic:claude-haiku-4-5"],
    );
    check("configured chain is unfiltered", getConfiguredChain().length, 3);
    check(
      "missing keys are reported",
      missingKeys().sort(),
      ["google", "openai"] as ProviderId[],
    );
  },
);

withEnv({ ...NO_KEYS, LLM_MODELS: "google:gemini-3.5-flash" }, () => {
  check("no keys at all means nothing to try", getModelChain().length, 0);
});

console.log("\n--- sampling parameters ---");

// Anthropic removed temperature on its newer models: sending it is a 400.
for (const [id, expected] of [
  ["claude-haiku-4-5", true],
  ["claude-sonnet-4-6", true],
  ["claude-opus-5", false],
  ["claude-sonnet-5", false],
  ["claude-opus-4-8", false],
  ["claude-fable-5", false],
  // An id released after this was written is assumed strict, so it loses the
  // temperature rather than failing every request.
  ["claude-something-new", false],
] as const) {
  check(
    `anthropic:${id} accepts temperature = ${expected}`,
    acceptsTemperature({ provider: "anthropic", id }),
    expected,
  );
}

check(
  "google always accepts temperature",
  acceptsTemperature({ provider: "google", id: "gemini-3.5-flash" }),
  true,
);
check(
  "openai always accepts temperature",
  acceptsTemperature({ provider: "openai", id: "gpt-x" }),
  true,
);

console.log(failures ? `\n${failures} failing` : "\nthe model chain behaves as expected");
process.exit(failures ? 1 : 0);
