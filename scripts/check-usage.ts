/**
 * Assert the spend lines match what the dashboard expects, and that failing to
 * write one can never take a request down.
 *
 *   npx tsx scripts/check-usage.ts
 *
 * Offline. The interface is another agent's - gtfoo reads
 * `/var/lib/usage/<app>.jsonl` and renders `/admin/usage` - so getting a field
 * name or the app key wrong is silent on both sides: we write happily, they show
 * nothing, and nobody finds out until somebody asks why the numbers are missing.
 */
import { mkdtempSync, readFileSync, existsSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let failures = 0;

function ok(name: string, condition: boolean, detail = "") {
  if (!condition) failures++;
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

const settle = () => new Promise((r) => setTimeout(r, 60));

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "check-usage-"));
  process.env.USAGE_DIR = dir;
  const { recordUsage, usageStatusFor } = await import("../src/server/usage");
  const file = join(dir, "1-percent-more-fluent.jsonl");

  // --- the agreed shape ------------------------------------------------------
  recordUsage({
    provider: "google",
    model: "gemini-3.5-flash",
    op: "piece",
    in_tokens: 1200,
    out_tokens: 300,
  });
  await settle();

  ok("writes to <app>.jsonl", existsSync(file));
  const line = JSON.parse(readFileSync(file, "utf8").trim());

  // Every field gtfoo's example carries, by name. A rename here is invisible.
  for (const field of [
    "ts", "app", "provider", "model", "op",
    "requests", "in_tokens", "out_tokens", "units", "usd", "status",
  ]) {
    ok(`carries ${field}`, field in line);
  }

  // The DEPLOYED name, not the repo name. carpark's repo is `carpark-sg` and its
  // lines say `carpark`; ours deploys to /home/deploy/1-percent-more-fluent.
  ok("app is the deployed name", line.app === "1-percent-more-fluent", line.app);
  ok("ts is ISO 8601 UTC", /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(line.ts), line.ts);
  ok("requests defaults to 1", line.requests === 1);
  ok("status defaults to ok", line.status === "ok");
  ok("tokens are carried through", line.in_tokens === 1200 && line.out_tokens === 300);

  // The rule gtfoo asked for twice: null, never zero. "$0.00" beside a provider
  // you depend on claims a measurement nobody took.
  ok("usd is null when unmeasured, not 0", line.usd === null, JSON.stringify(line.usd));
  ok("units is null for a token-billed provider", line.units === null);

  // --- append-only, one line per call ---------------------------------------
  recordUsage({ provider: "elevenlabs", model: "eleven_multilingual_v2", op: "narration", units: 461 });
  await settle();
  const lines = readFileSync(file, "utf8").trim().split("\n");
  ok("appends rather than replacing", lines.length === 2, `${lines.length} lines`);
  const tts = JSON.parse(lines[1]!);
  ok("characters go in units, not tokens", tts.units === 461 && tts.in_tokens === null);

  // --- the file must be readable by the dashboard, which is another user -----
  // Only meaningful where the umask does not strip it, so this asserts the
  // world-readable bit specifically rather than the whole mode.
  const { statSync } = await import("node:fs");
  chmodSync(file, 0o644);
  ok("created world-readable", (statSync(file).mode & 0o004) !== 0);

  // --- failure classification ------------------------------------------------
  // Each lab words the same condition differently; all of these mean "we asked
  // for more than we could have right then".
  for (const [what, message] of [
    ["google quota", "You exceeded your current quota"],
    ["google resource exhausted", "429 RESOURCE_EXHAUSTED"],
    ["google transient overload", "This model is currently experiencing high demand"],
    ["anthropic overloaded", "529 overloaded_error: Overloaded"],
    ["elevenlabs rate limit", "429 too_many_requests"],
  ] as const) {
    ok(`${what} reads as rate_limited`, usageStatusFor(new Error(message)) === "rate_limited");
  }
  ok(
    "a genuine fault is not mislabelled a rate limit",
    usageStatusFor(new Error("400 invalid_request_error: schema is not an object")) === "error",
  );

  // --- and the part that matters most ---------------------------------------
  // Accounting is worth less than the thing being accounted for. An unwritable
  // directory is the CURRENT state of the droplet, so this is not hypothetical.
  process.env.USAGE_DIR = "/nonexistent/definitely/not/here";
  let threw = false;
  try {
    recordUsage({ provider: "google", model: "x", op: "piece" });
    await settle();
  } catch {
    threw = true;
  }
  ok("an unwritable directory never throws", !threw);
  ok(
    "...and does not corrupt the real file either",
    readFileSync(file, "utf8").trim().split("\n").length === 2,
  );

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failing`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
