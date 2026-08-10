/**
 * Assert the paid routes have a ceiling, and that it cannot be walked around.
 *
 *   npx tsx scripts/check-limits.ts
 *
 * No LLM, no network. A scratch database and a fake clock, so the day-long
 * windows are testable without waiting a day.
 *
 * The assertion that matters most is the X-Forwarded-For one. Reading the FIRST
 * entry of that header instead of the last is the standard way to build a rate
 * limiter that does nothing at all, because the first entry is whatever the
 * caller typed - and a limiter that can be bypassed with a header is worse than
 * none, since it looks like protection on the dashboard.
 *
 * src/server imports are dynamic and inside main(): paths.ts reads DATA_DIR
 * once at module load, so a static import points the whole test at the real
 * database.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const pass = a === e;
  if (!pass) failures++;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}`);
  if (!pass) console.log(`       expected ${e}\n       got      ${a}`);
}

function ok(name: string, condition: boolean, detail = "") {
  if (!condition) failures++;
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

const HOUR = 3600;
const SEC = 1000;

async function main() {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "fluent-limits-"));
  const { clientIp, PLANS, spendIp, spendUser, tooMany } = await import("../src/server/limits");

  const req = (xff?: string) =>
    new Request("http://x/api/generate", {
      headers: xff ? { "x-forwarded-for": xff } : {},
    });

  console.log("--- which address a request comes from ---");
  {
    check("one proxy, one address", clientIp(req("203.0.113.9")), "203.0.113.9");
    // The attack this exists to stop: a caller sends their own header hoping to
    // be counted as somebody else, or as a fresh address every request. Caddy
    // APPENDS the peer it actually saw, so the last entry is the true one and
    // everything before it is the caller's own text.
    check(
      "a forged hop does not become the address",
      clientIp(req("1.1.1.1, 203.0.113.9")),
      "203.0.113.9",
    );
    check(
      "...however many they invent",
      clientIp(req("a, b, c, d, 203.0.113.9")),
      "203.0.113.9",
    );
    check("spacing does not matter", clientIp(req("1.1.1.1,203.0.113.9")), "203.0.113.9");
    check("no proxy at all is local development", clientIp(req()), "local");
    check("an empty header is not an empty address", clientIp(req("")), "local");
  }

  console.log();
  console.log("--- the ceiling itself ---");
  {
    const plan = {
      name: "test-basic",
      perIp: [{ limit: 3, windowSec: HOUR }],
      perUser: [],
    };
    const t0 = 1_000_000 * SEC;
    const verdicts = [0, 1, 2, 3, 4].map(() => spendIp(plan, "10.0.0.1", t0));
    check(
      "three go through, the fourth does not",
      verdicts.map((v) => v.ok),
      [true, true, true, false, false],
    );
    ok(
      "and it says when to come back",
      verdicts[3]!.retryAfter > 0 && verdicts[3]!.retryAfter <= HOUR,
      `${verdicts[3]!.retryAfter}s`,
    );

    // A different address is a different bucket, or one noisy caller would take
    // the whole site down for everyone - which is a denial of service the
    // limiter performed on its owner's behalf.
    check("a different address is unaffected", spendIp(plan, "10.0.0.2", t0).ok, true);

    // Fixed windows: the count resets when the window does, not an hour after
    // the last request.
    check("the next window is clean", spendIp(plan, "10.0.0.1", t0 + HOUR * SEC).ok, true);
  }

  console.log();
  console.log("--- two windows at once ---");
  {
    // The real plans pair a short window with a long one, so a caller cannot
    // sit exactly on the hourly limit around the clock and spend twenty-four
    // times the daily one.
    const plan = {
      name: "test-two",
      perIp: [
        { limit: 2, windowSec: HOUR },
        { limit: 3, windowSec: 24 * HOUR },
      ],
      perUser: [],
    };
    const t0 = 1_000_000 * SEC;
    spendIp(plan, "10.0.0.3", t0);
    spendIp(plan, "10.0.0.3", t0);
    check("the hourly window binds first", spendIp(plan, "10.0.0.3", t0).ok, false);
    // ...and that refusal must NOT have eaten a daily slot. Retrying against a
    // closed hourly window used to spend the day silently, so a reader who
    // pressed the button twice more found themselves locked out an hour later
    // having generated nothing.
    spendIp(plan, "10.0.0.3", t0);
    spendIp(plan, "10.0.0.3", t0);

    // An hour on, the hourly window is clean and the day has exactly one left.
    const later = t0 + HOUR * SEC;
    check("a fresh hour still has the day's allowance", spendIp(plan, "10.0.0.3", later).ok, true);
    const spent = spendIp(plan, "10.0.0.3", later);
    check("...until the day is spent too", spent.ok, false);
    ok(
      "and the wait quoted is the day's, not the sooner lie",
      spent.retryAfter > HOUR,
      `${spent.retryAfter}s`,
    );
  }

  console.log();
  console.log("--- readers and addresses are counted apart ---");
  {
    const plan = {
      name: "test-split",
      perIp: [{ limit: 100, windowSec: HOUR }],
      perUser: [{ limit: 2, windowSec: HOUR }],
    };
    const t0 = 1_000_000 * SEC;
    spendUser(plan, "reader-a", t0);
    spendUser(plan, "reader-a", t0);
    check("one reader hits their own ceiling", spendUser(plan, "reader-a", t0).ok, false);
    check("a second reader is untouched", spendUser(plan, "reader-b", t0).ok, true);
    // The two anchors must not share a bucket, or charging the address would
    // eat the reader's allowance and every limit would be half what it says.
    check("and the address has spent nothing", spendIp(plan, "10.0.0.4", t0).ok, true);
  }

  console.log();
  console.log("--- the plans the app actually ships ---");
  {
    // Generation is the expensive one, so its ceiling has to be the lowest.
    const perHour = (p: { perIp: readonly { limit: number; windowSec: number }[] }) =>
      p.perIp.find((r) => r.windowSec === HOUR)!.limit;
    ok(
      "generation is capped tighter than lookups",
      perHour(PLANS.generate) < perHour(PLANS.gloss),
      `${perHour(PLANS.generate)} vs ${perHour(PLANS.gloss)}`,
    );
    ok(
      "every paid plan has a per-address rule",
      [PLANS.generate, PLANS.gloss, PLANS.tts, PLANS.wordTts, PLANS.placement].every(
        (p) => p.perIp.length > 0,
      ),
    );
    // Without a daily window the hourly one is worth 24x its number overnight,
    // which is exactly when nobody is watching.
    ok(
      "the money-spending plans have a daily backstop too",
      [PLANS.generate, PLANS.tts].every((p) =>
        p.perIp.some((r) => r.windowSec === 86_400),
      ),
    );
  }

  console.log();
  console.log("--- the refusal itself ---");
  {
    const res = tooMany({ ok: false, retryAfter: 42 }, "slow down");
    check("is a 429", res.status, 429);
    check("and says how long to wait", res.headers.get("Retry-After"), "42");
    const body = (await res.json()) as { error: string };
    check("with a message, not a bare code", body.error, "slow down");
  }

  console.log();
  console.log("--- old rows do not accumulate forever ---");
  {
    const { getDb } = await import("../src/server/db");
    const plan = { name: "test-sweep", perIp: [{ limit: 5, windowSec: HOUR }], perUser: [] };
    const old = 1_000_000 * SEC;
    spendIp(plan, "10.0.0.9", old);
    const before = (
      getDb().prepare("SELECT COUNT(*) AS n FROM rate_limits").get() as { n: number }
    ).n;
    ok("a request leaves a row", before > 0, `${before}`);

    // Three days on, the old windows are unreachable and should be gone. The
    // sweep runs when a NEW window opens, so this call is what triggers it.
    spendIp(plan, "10.0.0.9", old + 3 * 24 * HOUR * SEC);
    const stale = (
      getDb()
        .prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE window_at < ?")
        .get(Math.floor(old / 1000)) as { n: number }
    ).n;
    check("and days-old rows are swept", stale, 0);
  }

  console.log();
  if (failures > 0) {
    console.log(`${failures} failing`);
    process.exit(1);
  }
  console.log("all limit checks passed");
}

void main();
