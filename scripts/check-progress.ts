/**
 * Assert the progress page tells the truth.
 *
 *   npm run progress
 *
 * No LLM, no network, no clock. Everything here is SQLite and arithmetic
 * against a scratch database, which is the whole point of the feature: it
 * reads data the app already had rather than collecting anything new.
 *
 * The assertions that matter most are the honest-on-a-bad-day ones. This page
 * exists partly to show a level going DOWN without dressing it up, and a
 * progress page that quietly clamps at zero would be lying on exactly the days
 * a reader most needs it not to.
 *
 * src/server imports are dynamic and inside main(): paths.ts reads DATA_DIR
 * once at module load, so a static import points the whole test at the real
 * database. That has already bitten this repo twice.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_BOX,
  MIN_WINDOW,
  plotLevels,
  type LevelPoint,
} from "../src/lib/chart";
import {
  currentRun,
  dayShift,
  daysRead,
  fillDays,
  localDay,
  longestRun,
  DAY_FINISHED,
  DAY_LOOKED,
  DAY_MADE,
  DAY_NONE,
  type ReadingDay,
} from "../src/lib/streaks";
import { FIELDS } from "../src/lib/suggestions";
import { FORMATS } from "../src/lib/formats";
import { localeFor } from "../src/lib/ui";
import { spanish } from "../src/lib/languages/es";

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

const day = (d: string, weight = DAY_FINISHED, events = 1): ReadingDay =>
  ({ day: d, weight, events }) as ReadingDay;

const reading = (before: number, after: number, at: string): LevelPoint => ({
  at,
  levelBefore: before,
  levelAfter: after,
  note: null,
});

async function main() {
  // ---- Which locale the figures are written in ----------------------------
  //
  // Every number on this page is a word count in the thousands, so the
  // separator is load-bearing: "2.269" is two thousand in Spanish and two in
  // English. A bare toLocaleString() follows the SERVER's locale, which is how
  // a fully Spanish interface came to print English separators.
  console.log("--- the figures are in the reader's own locale ---");
  {
    check("target chrome formats in the target language", localeFor(spanish,true), "es");
    check("English chrome formats in English", localeFor(spanish,false), "en");
    // Not a tautology: it is the assertion that the tags actually reach ICU and
    // produce four different, correct conventions. If Node ever ships without
    // full ICU these all collapse to the English form and this fails loudly
    // rather than shipping numbers that read a thousandfold wrong.
    check("Spanish groups from five digits, not four", (1400).toLocaleString("es"), "1400");
    check("...and uses a point once it does", (12500).toLocaleString("es"), "12.500");
    check("Indonesian uses a point from four", (1400).toLocaleString("id"), "1.400");
    check("Chinese uses a comma", (1400).toLocaleString("zh-CN"), "1,400");
    check("English uses a comma", (1400).toLocaleString("en"), "1,400");
  }

  // ---- Pure geometry, no database -----------------------------------------
  console.log();
  console.log("--- the chart ---");
  {
    const empty = plotLevels([]);
    ok("no readings draws nothing", empty.empty && empty.segments.length === 0);

    const one = plotLevels([reading(40, 45, "2026-01-01T00:00:00Z")]);
    check("a single reading is one dot", one.dots.length, 1);
    ok(
      "...placed in the middle, not against the left edge",
      Math.abs(one.dots[0]!.x - DEFAULT_BOX.width / 2) < DEFAULT_BOX.width / 2,
      `x=${one.dots[0]!.x}`,
    );

    const flat = plotLevels([
      reading(50, 50, "2026-01-01T00:00:00Z"),
      reading(50, 50, "2026-01-02T00:00:00Z"),
    ]);
    ok(
      "a level that never moved does not divide by zero",
      flat.dots.every((d) => Number.isFinite(d.y)),
      JSON.stringify(flat.dots.map((d) => d.y)),
    );

    const rising = plotLevels([
      reading(40, 45, "2026-01-01T00:00:00Z"),
      reading(45, 60, "2026-01-02T00:00:00Z"),
    ]);
    ok(
      "a higher level sits higher on the page",
      rising.dots[1]!.y < rising.dots[0]!.y,
      `${rising.dots[0]!.y} -> ${rising.dots[1]!.y}`,
    );
    ok(
      "every point is inside the box",
      rising.dots.every(
        (d) =>
          d.x >= DEFAULT_BOX.padLeft &&
          d.x <= DEFAULT_BOX.width - DEFAULT_BOX.padRight &&
          d.y >= DEFAULT_BOX.padTop &&
          d.y <= DEFAULT_BOX.height - DEFAULT_BOX.padBottom,
      ),
    );

    // A four-point wobble auto-fitted to its own range would fill the frame
    // and read as a collapse. The window keeps a small move looking small.
    const wobble = plotLevels([reading(50, 52, "a"), reading(52, 50, "b")]);
    const span = Math.abs(wobble.ticks[0]!.level - wobble.ticks[3]!.level);
    ok("a small move gets a wide window", span >= MIN_WINDOW - 0.01, `span ${span.toFixed(1)}`);

    // The gap the Too hard / Too easy buttons leave: they move the level and
    // write no session row, so the next reading starts somewhere the last one
    // did not end.
    const gapped = plotLevels([reading(40, 45, "a"), reading(60, 62, "b")]);
    check(
      "a level that moved outside a reading is marked",
      gapped.segments.filter((s) => s.kind === "adjusted").length,
      1,
    );
    const joined = plotLevels([reading(40, 45, "a"), reading(45, 50, "b")]);
    check(
      "...and a continuous one is not",
      joined.segments.filter((s) => s.kind === "adjusted").length,
      0,
    );
    check(
      "a continuous run is drawn as a hold",
      joined.segments.filter((s) => s.kind === "hold").length,
      1,
    );

    // Re-taking the level check is a different event from nudging the buttons,
    // and the reader is told which.
    const replaced = plotLevels([
      reading(40, 45, "a"),
      { ...reading(70, 72, "b"), origin: true },
    ]);
    check(
      "re-taking the check is labelled as that",
      replaced.segments.filter((s) => s.kind === "replaced").length,
      1,
    );

    ok(
      "ticks are labelled in words, ascending up the page",
      rising.ticks.length === 4 &&
        rising.ticks[0]!.words < rising.ticks[3]!.words &&
        rising.ticks[0]!.y > rising.ticks[3]!.y,
      rising.ticks.map((t) => t.words).join(", "),
    );
  }

  // ---- Pure streaks, no database ------------------------------------------
  console.log("\n--- reading days ---");
  {
    const run = [day("2026-03-01"), day("2026-03-02"), day("2026-03-03")];
    check("three days in a row is a run of three", longestRun(run), 3);
    check("and three days read", daysRead(run), 3);

    const broken = [...run, day("2026-03-05"), day("2026-03-06")];
    check("a gap ends the run", longestRun(broken), 3);

    // The humane rule: at nine in the morning you have not broken yesterday's
    // streak, you have simply not read yet today.
    check("today still counts if you have read", currentRun(run, "2026-03-03"), 3);
    check("...and yesterday's run survives an unread morning", currentRun(run, "2026-03-04"), 3);
    check("but a whole missed day ends it", currentRun(run, "2026-03-05"), 0);

    // Ten lookups in one sitting is one day. Counting events would let a
    // single afternoon manufacture a streak.
    check("a busy single day is still one day", longestRun([day("2026-03-01", DAY_FINISHED, 10)]), 1);
    check("empty days never count", daysRead([day("2026-03-01", DAY_NONE, 0)]), 0);

    // Month boundaries and leap years are the platform's problem, not ours.
    check(
      "a run crosses the end of a month",
      longestRun([day("2026-01-31"), day("2026-02-01")]),
      2,
    );

    const filled = fillDays([day("2026-03-03")], "2026-03-01", "2026-03-05");
    check("the calendar keeps its gaps", filled.length, 5);
    check("...with the read day in place", filled[2]!.weight, DAY_FINISHED);
    check("...and the rest empty", filled[0]!.weight, DAY_NONE);
  }

  // ---- Everything below needs a database ----------------------------------
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "fluent-progress-"));
  process.env.AUDIO_DIR = join(process.env.DATA_DIR, "audio");

  const { getDb } = await import("../src/server/db");
  const { progressSummary, levelSeries, breadth, readingDays } = await import(
    "../src/server/progress"
  );
  const db = getDb();

  console.log("\n--- SQLite really does parse our timestamps ---");
  {
    // If date() ever returned NULL for an ISO string with milliseconds and a Z,
    // the whole calendar would come back empty and nothing would throw. That is
    // the failure class this repo keeps meeting, so it is asserted rather than
    // assumed.
    const r = db
      .prepare("SELECT date('2026-08-09T12:34:56.789Z') AS d, date('2026-08-09T12:34:56.789Z', ?) AS s")
      .get("+0 hours") as { d: string | null; s: string | null };
    check("date() buckets an ISO timestamp", r.d, "2026-08-09");
    check("...and the no-op modifier really is one", r.s, "2026-08-09");

    // The trap this whole section exists for. An empty modifier is not "no
    // modifier" - it is invalid, and SQLite answers NULL rather than raising.
    // Every event would land on a null day and the calendar would render empty
    // with nothing in the logs.
    const empty = db.prepare("SELECT date('2026-08-09T12:34:56.789Z', ?) AS d").get("") as {
      d: string | null;
    };
    check("an EMPTY modifier is null, which is why the default is not ''", empty.d, null);

    // The reader's own midnight. Everything dayShift can produce has to be a
    // modifier SQLite accepts - anything it does not accept comes back NULL,
    // and a whole calendar would silently empty itself.
    const shifted = (tz: string | undefined, at: string) =>
      (
        db.prepare("SELECT date(?, ?) AS d").get(at, dayShift(tz)) as { d: string | null }
      ).d;

    // 1am in Singapore on the 10th is 5pm UTC on the 9th. UTC called that a
    // different day, which is how a streak broke on a day that was read.
    check("east of UTC, a late night stays on its own day", shifted("480", "2026-08-09T17:00:00Z"), "2026-08-10");
    check("west of UTC, an early evening does too", shifted("-300", "2026-08-10T02:00:00Z"), "2026-08-09");
    check("no cookie is UTC, unchanged", shifted(undefined, "2026-08-09T17:00:00Z"), "2026-08-09");

    // The cookie is written by the browser, so every one of these is something
    // a caller can actually send. None of them may reach SQLite as text.
    for (const junk of ["", "abc", "1e3", "12.5", "99999", "-99999", "+0 hours); DROP", "NaN"]) {
      check(`junk cookie ${JSON.stringify(junk)} falls back to UTC`, shifted(junk, "2026-08-09T17:00:00Z"), "2026-08-09");
    }
    check("and the shift itself is only ever a number of minutes", dayShift("480"), "+480 minutes");
    check("negative offsets keep their sign", dayShift("-330"), "-330 minutes");

    // localDay must use the same offset as the bucketing, or "today" belongs to
    // a different calendar than the squares do.
    check(
      "today is the reader's today",
      localDay(Date.parse("2026-08-09T17:00:00Z"), "480"),
      "2026-08-10",
    );
    check(
      "...and falls back the same way",
      localDay(Date.parse("2026-08-09T17:00:00Z"), "junk"),
      "2026-08-09",
    );
  }

  const now = new Date().toISOString();
  const user = (id: string) =>
    db.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").run(id, now);
  const profile = (uid: string, lang: string, level: number, vocab: number | null) =>
    db
      .prepare(
        `INSERT INTO profiles (user_id, language, level, vocab_estimate, placed_at, updated_at)
         VALUES (?,?,?,?,?,?)`,
      )
      .run(uid, lang, level, vocab, "2026-01-01T00:00:00.000Z", now);
  const piece = (id: string, uid: string, lang: string, fmt: string, field: string | null, at: string) =>
    db
      .prepare(
        `INSERT INTO pieces (id,user_id,language,format,topic,topic_field,level,title,body,
                             glossary,questions,report,created_at)
         VALUES (?,?,?,?,'t',?,30,?,'[]','[]','[]','{}',?)`,
      )
      .run(id, uid, lang, fmt, field, `T-${id}`, at);
  const session = (id: string, pieceId: string, uid: string, before: number, after: number, at: string) =>
    db
      .prepare(
        `INSERT INTO sessions (id,piece_id,user_id,rating,quiz_score,lookup_rate,
                               level_before,level_after,created_at)
         VALUES (?,?,?,NULL,NULL,0.05,?,?,?)`,
      )
      .run(id, pieceId, uid, before, after, at);
  const lookup = (uid: string, pieceId: string, word: string, at: string) =>
    db
      .prepare("INSERT INTO lookups (user_id,piece_id,word,created_at) VALUES (?,?,?,?)")
      .run(uid, pieceId, word, at);

  console.log("\n--- the headline ---");
  {
    user("u1");
    profile("u1", "es", 50, 2000);
    check("placed but nothing read yet does not throw", progressSummary("u1", "es")!.sessions, 0);
    const s = progressSummary("u1", "es")!;
    // The placement still writes a vocabulary estimate - that is the test's own
    // raw output - but the summary converts it to a LEVEL and nothing on the
    // page ever sees a word count again. levelForVocab(2000) is that level.
    check("...and 'then' is the placement, as a level", Math.round(s.thenLevel), 38);
    ok("...with 'now' from the profile", s.nowLevel === 50, String(s.nowLevel));
    check("a reader with no profile gets nothing", progressSummary("u1", "de"), null);
    ok(
      "no word count survives on the summary at all",
      !("nowWords" in s) && !("thenWords" in s) && !("deltaWords" in s),
      Object.keys(s).join(","),
    );

    // The decision the owner made, as an executable assertion: a level that has
    // come down since placement produces a NEGATIVE number, not a zero.
    user("u2");
    profile("u2", "es", 20, 6000);
    const down = progressSummary("u2", "es")!;
    ok("going backwards is reported honestly", down.delta < 0, String(down.delta));

    // No placement (an anonymous reader who never took the check) falls back to
    // the earliest level we ever saw, and says so.
    user("u3");
    profile("u3", "es", 60, null);
    piece("p-u3", "u3", "es", "story", "food", "2026-02-01T09:00:00.000Z");
    session("s-u3", "p-u3", "u3", 30, 33, "2026-02-01T10:00:00.000Z");
    const guessed = progressSummary("u3", "es")!;
    ok("a missing placement falls back to the first level seen", !guessed.fromPlacement);
    ok("...which is lower than now", guessed.thenLevel < guessed.nowLevel);
  }

  console.log("\n--- the series ---");
  {
    user("u4");
    profile("u4", "es", 55, 1500);
    profile("u4", "zh-CN", 10, 400);
    piece("p1", "u4", "es", "story", "food", "2026-03-01T09:00:00.000Z");
    piece("p2", "u4", "es", "article", "payments", "2026-03-02T09:00:00.000Z");
    piece("pz", "u4", "zh-CN", "story", "travel", "2026-03-03T09:00:00.000Z");
    session("s2", "p2", "u4", 45, 50, "2026-03-05T09:00:00.000Z");
    session("s1", "p1", "u4", 40, 45, "2026-03-04T09:00:00.000Z");
    session("sz", "pz", "u4", 10, 12, "2026-03-06T09:00:00.000Z");

    const es = levelSeries("u4", "es");
    check("oldest first, unlike every other list", es.map((r) => r.at.slice(0, 10)), [
      "2026-03-04",
      "2026-03-05",
    ]);
    check("a Chinese reading never enters the Spanish series", es.length, 2);
    check("...and the Chinese one has its own", levelSeries("u4", "zh-CN").length, 1);
    check("another reader's history is not mine", levelSeries("u1", "es").length, 0);

    // Re-reading is a second point now, not a replacement of the first.
    session("s1b", "p1", "u4", 50, 53, "2026-03-09T09:00:00.000Z");
    check("re-reading adds a reading", levelSeries("u4", "es").length, 3);
  }

  console.log("\n--- the breadth grid ---");
  {
    user("u5");
    profile("u5", "es", 40, 1200);
    const grid0 = breadth("u5", "es");
    check("always the full grid, however little is read", grid0.cells.length, FIELDS.length * FORMATS.length);
    check("...which is 24", grid0.cells.length, 24);
    check("in fields x formats order", grid0.cells[0], {
      field: FIELDS[0],
      format: FORMATS[0],
      state: "empty",
      count: 0,
    });
    check("nothing filled yet", grid0.filled, 0);

    piece("g1", "u5", "es", "story", "food", "2026-04-01T09:00:00.000Z");
    session("gs1", "g1", "u5", 40, 41, "2026-04-01T10:00:00.000Z");
    // Generated and abandoned: started, not filled.
    piece("g2", "u5", "es", "article", "sport", "2026-04-02T09:00:00.000Z");

    const grid = breadth("u5", "es");
    const cell = (f: string, fmt: string) =>
      grid.cells.find((c) => c.field === f && c.format === fmt)!;
    check("a finished reading fills its cell", cell("food", "story").state, "filled");
    check("...and counts", cell("food", "story").count, 1);
    check("a generated piece only starts one", cell("sport", "article").state, "started");
    check("...and counts nothing", cell("sport", "article").count, 0);
    check("an untouched cell is empty", cell("travel", "conversation").state, "empty");
    check("one cell filled", grid.filled, 1);

    // "other" and NULL are two different facts and must not become cells.
    piece("g3", "u5", "es", "story", "other", "2026-04-03T09:00:00.000Z");
    session("gs3", "g3", "u5", 41, 42, "2026-04-03T10:00:00.000Z");
    piece("g4", "u5", "es", "story", null, "2026-04-04T09:00:00.000Z");
    session("gs4", "g4", "u5", 42, 43, "2026-04-04T10:00:00.000Z");

    const after = breadth("u5", "es");
    check("still 24 cells", after.cells.length, 24);
    check("'other' is a footnote, not a cell", after.otherCount, 1);
    check("and so is 'before we labelled', separately", after.unlabelledCount, 1);
    ok(
      "neither invented a field",
      after.cells.every((c) => (FIELDS as readonly string[]).includes(c.field)),
    );
  }

  console.log("\n--- reading days, from three signals ---");
  {
    user("u6");
    profile("u6", "es", 30, 900);
    piece("d1", "u6", "es", "story", "food", "2026-05-01T09:00:00.000Z");
    piece("d2", "u6", "es", "story", "food", "2026-05-02T09:00:00.000Z");
    session("ds2", "d2", "u6", 30, 31, "2026-05-03T09:00:00.000Z");
    lookup("u6", "d1", "casa", "2026-05-04T09:00:00.000Z");

    const days = readingDays("u6", "es", "2026-01-01T00:00:00.000Z");
    const byDay = new Map(days.map((d) => [d.day, d]));
    check("asking for a piece counts as showing up", byDay.get("2026-05-01")!.weight, DAY_MADE);
    check("finishing one counts more", byDay.get("2026-05-03")!.weight, DAY_FINISHED);
    check("looking a word up counts in between", byDay.get("2026-05-04")!.weight, DAY_LOOKED);
    check("four separate days", days.length, 4);

    // Everything on one day collapses to one day, at its strongest.
    lookup("u6", "d1", "perro", "2026-05-01T11:00:00.000Z");
    const again = readingDays("u6", "es", "2026-01-01T00:00:00.000Z");
    const first = again.find((d) => d.day === "2026-05-01")!;
    check("a day is a day however much happened", again.length, 4);
    check("...and takes its strongest signal", first.weight, DAY_LOOKED);
    check("...while still counting the events", first.events, 2);

    check(
      "the window is respected",
      readingDays("u6", "es", "2026-05-03T00:00:00.000Z").length,
      2,
    );
    check("another language is another calendar", readingDays("u6", "zh-CN", "2026-01-01T00:00:00.000Z").length, 0);
  }

  console.log(failures ? `\n${failures} failing` : "\nprogress reports what actually happened");
  process.exit(failures ? 1 : 0);
}

void main();
