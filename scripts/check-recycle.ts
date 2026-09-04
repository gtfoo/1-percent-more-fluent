/**
 * Assert the lookup-recycling loop: the right words are chosen, the prompt
 * carries them, the verifier exempts them, and the stored list never lies.
 *
 *   npx tsx scripts/check-recycle.ts
 *
 * Offline: scratch database, no network, no model. What it guards is the
 * retention mechanic - a tapped word coming back in the next piece - and the
 * honesty rule around it: the reader is only ever told about words that are
 * actually in the text.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

let failures = 0;

function ok(name: string, condition: boolean, detail = "") {
  if (!condition) failures++;
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

async function main() {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "check-recycle-"));

  const { getDb } = await import("../src/server/db");
  const { wordsToRecycle } = await import("../src/server/vocabulary");
  const { buildPrompt, recycledInProse, FLOOR_LEVEL } = await import(
    "../src/server/generate"
  );
  const { paramsFor } = await import("../src/lib/level");
  const { getLanguage } = await import("../src/lib/languages");
  const { measure } = await import("../src/server/difficulty");

  const db = getDb();
  const user = randomUUID();
  const other = randomUUID();

  const addPiece = (id: string, language: string) =>
    db
      .prepare(
        `INSERT INTO pieces (id, user_id, language, format, topic, level, title, body, glossary, questions, speakers, terms, report, model, created_at)
         VALUES (?, ?, ?, 'story', 't', 30, 't', '[]', '[]', '[]', '[]', '[]', '{}', 'm', ?)`,
      )
      .run(id, user, language, new Date().toISOString());

  const tap = (pieceId: string, word: string, minutesAgo: number) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO lookups (user_id, piece_id, word, created_at) VALUES (?, ?, ?, ?)`,
      )
      .run(user, pieceId, word, new Date(Date.now() - minutesAgo * 60_000).toISOString());

  // Three Spanish pieces and one Chinese one.
  const [p1, p2, p3, zh1] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  addPiece(p1, "es");
  addPiece(p2, "es");
  addPiece(p3, "es");
  addPiece(zh1, "zh-CN");

  // --- ranking: the pedagogy as executable order ----------------------------
  tap(p1, "amanecer", 300); // 1 piece, old
  tap(p1, "hueso", 200);    // 2 pieces - the circling word
  tap(p2, "hueso", 100);
  tap(p2, "lograr", 90);    // 1 piece, newer than amanecer
  tap(p3, "ahora-mismo", 5); // too fresh - same encounter, not a re-encounter
  tap(p3, "x".repeat(30), 400); // junk selection - over the length cap
  tap(zh1, "尴尬", 300);     // other language
  db.prepare(
    `INSERT OR IGNORE INTO lookups (user_id, piece_id, word, created_at) VALUES (?, ?, ?, ?)`,
  ).run(other, p1, "ajeno", new Date(Date.now() - 300 * 60_000).toISOString());

  const words = wordsToRecycle(user, "es");
  ok("multi-piece words lead", words[0] === "hueso", words.join(","));
  ok(
    "then least-recently-seen",
    words.indexOf("amanecer") < words.indexOf("lograr"),
    words.join(","),
  );
  ok("nothing tapped in the last 30 minutes", !words.includes("ahora-mismo"));
  ok("junk-length selections are excluded", !words.some((w) => w.length > 24));
  ok("another language's taps stay out", !words.includes("尴尬"));
  ok("another reader's taps stay out", !words.includes("ajeno"));
  ok("capped at six", words.length <= 6, `${words.length}`);
  ok("chinese pulls its own set", wordsToRecycle(user, "zh-CN")[0] === "尴尬");

  // --- the prompt carries them, and only when asked -------------------------
  const es = getLanguage("es");
  const params = paramsFor(50, es);
  const prompt = buildPrompt("story", "los mercados", "medium", params, undefined, undefined, [
    "hueso",
    "amanecer",
  ]);
  ok("prompt names the recycled words", prompt.includes("hueso, amanecer"));
  ok("prompt exempts them from the budget", /exempt from the vocabulary limit/i.test(prompt));
  ok(
    "no recycle block when there is nothing to recycle",
    !buildPrompt("story", "los mercados", "medium", params).includes("recently needed help"),
  );

  // --- the verifier treats them as deliberate -------------------------------
  // A genuinely rare word, repeated - unexempted it must move the measured
  // rate, exempted it must not. Same text both ways, so the comparison is the
  // exemption and nothing else.
  const prose =
    "El perro come pan y agua todos los días. " +
    "Quisquilloso, el perro mira la casa. Quisquilloso otra vez, y quisquilloso siempre.";
  const raw = measure(prose, params, [], []);
  const exempted = measure(prose, params, ["quisquilloso"], []);
  ok(
    "an exempted recycled word stops counting as out-of-band",
    exempted.outOfBandRate < raw.outOfBandRate,
    `${(raw.outOfBandRate * 100).toFixed(1)}% -> ${(exempted.outOfBandRate * 100).toFixed(1)}%`,
  );

  // --- the stored list never lies -------------------------------------------
  const text = "Ella encontró un hueso al amanecer. La casa estaba fría.";
  ok(
    "only words actually in the text are kept",
    recycledInProse(["hueso", "lograr"], text, "es").join(",") === "hueso",
  );
  ok(
    "a word inside another word claims no credit",
    recycledInProse(["casa"], "Van a casarse mañana.", "es").length === 0,
  );
  ok(
    "...but the standalone word does",
    recycledInProse(["casa"], text, "es").join(",") === "casa",
  );
  ok(
    "chinese matches without word boundaries",
    recycledInProse(["尴尬"], "他觉得很尴尬。", "zh-CN").join(",") === "尴尬",
  );
  ok(
    "regex metacharacters in a selection cannot break the match",
    recycledInProse(["a(b"], "sin coincidencia", "es").length === 0,
  );

  // --- the floor zone: scaffold ON, ceiling widened, reader floored ---------
  // The owner's 2026-08-19 decision after two bench runs (combined pass-rate
  // even; rates one-sided: scaffold medians closer to budget, zero under-floor
  // failures in 18 samples). These assertions pin all three levers, so undoing
  // any of them without a new measurement trips here first.
  const floor = paramsFor(15, es);
  const floorPrompt = buildPrompt("story", "mi familia", "long", floor);
  ok(`scaffold is ON below level ${FLOOR_LEVEL}`, /repetition/i.test(floorPrompt));
  ok("...and caps the piece short", /about 220 words in total/.test(floorPrompt));
  const forcedOff = buildPrompt("story", "mi familia", "long", floor, undefined, undefined, undefined, false);
  ok(
    "the bench can still force the baseline arm",
    !/repetition/i.test(forcedOff) && /about 600 words in total/.test(forcedOff),
  );
  const normalPrompt = buildPrompt("story", "mi familia", "long", paramsFor(50, es));
  ok("no scaffold at normal levels", !/repetition/i.test(normalPrompt));

  // The budget framing flips with the zone, because the zones fail in opposite
  // directions. BENCH_MODE=framing, 2026-08-26, 18 samples: ceiling wording
  // improved the median ratio at all three floor levels (2.80->2.10, 2.47->2.38,
  // 2.14->1.71) with zero under-floor failures. Above the zone the target
  // wording stays, because "at most X%" is what makes the model land near 1%
  // there. Swapping either without a new bench trips here.
  ok(
    "the budget reads as a CEILING inside the floor zone",
    /Keep it at or under that share/.test(floorPrompt) &&
      !/a figure to hit/.test(floorPrompt),
  );
  ok(
    "...and as a TARGET outside it",
    /a figure to hit/.test(normalPrompt) &&
      !/Keep it at or under that share/.test(normalPrompt),
  );
  ok(
    "...and the bench can force either arm",
    /a figure to hit/.test(
      buildPrompt("story", "mi familia", "long", floor, undefined, undefined, undefined, true, false),
    ) &&
      /Keep it at or under that share/.test(
        buildPrompt(
          "story",
          "mi familia",
          "long",
          paramsFor(50, es),
          undefined,
          undefined,
          undefined,
          false,
          true,
        ),
      ),
  );

  // The widened ceiling: a rate the standard slack rejects passes inside the
  // floor zone, and the identical ratio still fails outside it - the widening
  // is a floor-zone concession, not a general loosening.
  const { slackFor, BUDGET_SLACK, BUDGET_SLACK_FLOOR_ZONE } = await import(
    "../src/server/difficulty"
  );
  ok(
    "the ceiling widens only inside the floor zone",
    slackFor(15) === BUDGET_SLACK_FLOOR_ZONE && slackFor(20) === BUDGET_SLACK,
    `${slackFor(15)}x under 20, ${slackFor(20)}x from 20`,
  );
  ok("...and not into unfailability", BUDGET_SLACK_FLOOR_ZONE < 3);

  // The reader floor: measurement may go below 12, readers may not.
  const { clampReaderLevel, MIN_READER_LEVEL, clampLevel } = await import(
    "../src/lib/level"
  );
  ok("no reader lands below the floor", clampReaderLevel(3) === MIN_READER_LEVEL);
  ok("...while measurement still can", clampLevel(3) === 3);
  const { overrideLevel } = await import("../src/lib/level");
  ok(
    "'too hard' at the floor stays at the floor",
    overrideLevel(MIN_READER_LEVEL, "easier") === MIN_READER_LEVEL,
  );

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failing`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
