/**
 * Assert the starting-point chips follow the reader without narrowing on them.
 *
 *   npm run chips
 *
 * No LLM, no network. The ranker is a pure function, the field coercion is a
 * pure function, and the migration runs against a scratch database - so the
 * whole feature is testable for nothing, which is the point.
 *
 * The load-bearing assertion is "output is a permutation". Everything else here
 * is behaviour that could reasonably be tuned; that one is the guarantee that
 * ordering never quietly becomes filtering, which would destroy the
 * every-field-in-every-format invariant at runtime, where check-suggestions.ts
 * cannot see it.
 *
 * Anything touching src/server is imported INSIDE main, after DATA_DIR is set.
 * paths.ts reads the environment once at module load, so a static import here
 * points the migration test at the real database - which it silently did, and
 * the row it was looking for was simply not in there.
 */
import { mkdtempSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rankSuggestions, rankAll, type TopicHistory } from "../src/lib/rank-suggestions";
import {
  asTopicField,
  FIELDS,
  SUGGESTIONS,
  TOPIC_FIELDS,
  type Suggestion,
} from "../src/lib/suggestions";
import { FORMATS, type Format } from "../src/lib/formats";

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

const labels = (list: Suggestion[]) => list.map((s) => s.label);
const sorted = (list: Suggestion[]) => [...labels(list)].sort();
const STORY = SUGGESTIONS.story;
const SEED = "reader-1:3";

const read = (field: TopicHistory["field"], format: Format, topic = ""): TopicHistory => ({
  topic,
  format,
  field,
});

async function main() {
  console.log("--- cold start returns exactly what was authored ---");
  for (const format of FORMATS) {
    check(
      `${format} is untouched`,
      labels(rankSuggestions(SUGGESTIONS[format as Format], [], SEED)),
      labels(SUGGESTIONS[format as Format]),
    );
  }
  check("rankAll agrees", labels(rankAll([], SEED).story), labels(STORY));

  console.log("\n--- the output is always a permutation, never a subset ---");
  const histories: TopicHistory[][] = [
    [],
    [read("payments", "story")],
    [read("payments", "story"), read("payments", "article"), read("food", "story")],
    Array.from({ length: 20 }, () => read("engineering", "story")),
    [read(null, "story"), read(null, "article")],
    [read("other", "story")],
    STORY.map((s) => read(s.field, "story", s.topic)),
  ];
  for (const [i, history] of histories.entries()) {
    const out = rankSuggestions(STORY, history, SEED);
    check(`case ${i}: same chips`, sorted(out), sorted(STORY));
    check(`case ${i}: same count`, out.length, STORY.length);
  }

  console.log("\n--- affinity leads ---");
  {
    const history = [
      read("payments", "story"),
      read("payments", "article"),
      read("payments", "story"),
    ];
    const out = rankSuggestions(STORY, history, SEED);
    const payments = STORY.filter((s) => s.field === "payments").map((s) => s.label);
    ok("a payments chip is at the very front", payments.includes(out[0]!.label), out[0]!.label);

    const authoredFirst = labels(rankSuggestions(STORY, [], SEED))[0]!;
    ok(
      "...which the authored order did not have there",
      !payments.includes(authoredFirst),
      `authored first was "${authoredFirst}"`,
    );
  }

  console.log("\n--- but something unread is always near the front ---");
  {
    const history = [
      read("payments", "story"),
      read("payments", "article"),
      read("payments", "story"),
    ];
    const top4 = rankSuggestions(STORY, history, SEED).slice(0, 4);
    ok(
      "at least two untouched fields in the first four",
      top4.filter((c) => c.field !== "payments").length >= 2,
      top4.map((c) => `${c.label}(${c.field})`).join(", "),
    );
  }

  console.log("\n--- a topic already generated sinks ---");
  {
    const already = STORY[0]!;
    const out = rankSuggestions(STORY, [read(already.field, "story", already.topic)], SEED);
    const at = labels(out).indexOf(already.label);
    ok("it is not first any more", out[0]!.label !== already.label, `first is "${out[0]!.label}"`);
    ok("it is in the back half", at >= STORY.length / 2, `position ${at}`);
    ok("but it is still there", at >= 0);
  }

  console.log("\n--- pieces from before the label are inert ---");
  {
    // Ten unlabelled rows must rank exactly like no history. Otherwise every
    // existing reader gets a scrambled row for no reason at all.
    const old = Array.from({ length: 10 }, () => read(null, "story", "something old"));
    check(
      "null fields change nothing",
      labels(rankSuggestions(STORY, old, SEED)),
      labels(rankSuggestions(STORY, [], SEED)),
    );
  }

  console.log("\n--- deterministic, and it moves only when history does ---");
  {
    const history = [read("payments", "story")];
    check(
      "the same inputs twice give the same order",
      labels(rankSuggestions(STORY, history, SEED)),
      labels(rankSuggestions(STORY, history, SEED)),
    );
    // Two renders of the same page a second apart must not disagree; the home
    // page is server-rendered on every request.
    check(
      "a refresh is identical",
      labels(rankSuggestions(STORY, history, "reader-1:1")),
      labels(rankSuggestions(STORY, history, "reader-1:1")),
    );
    ok(
      "...but reading something new can rotate it",
      labels(rankSuggestions(STORY, history, "reader-1:1")).join() !==
        labels(rankSuggestions(STORY, history, "reader-1:2")).join(),
    );

    // Comments stripped first: the file explains at length why it does NOT use
    // Math.random, and grepping the raw source failed on its own explanation.
    const src = readFileSync("src/lib/rank-suggestions.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    ok("no Math.random in the ranker", !/Math\.random/.test(src));
    ok("no clock in the ranker", !/Date\.now|new Date/.test(src));
  }

  // --- Anything below here touches the server, so DATA_DIR comes first ------
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "fluent-chips-"));
  process.env.AUDIO_DIR = join(process.env.DATA_DIR, "audio");

  const { pieceSchema, listPieces, toTopicHistory } = await import("../src/server/generate");
  const { getLanguage } = await import("../src/lib/languages");

  console.log("\n--- the model is asked for a field ---");
  {
    for (const code of ["zh-CN", "es"]) {
      const shape = pieceSchema(getLanguage(code)).shape;
      ok(`${code} is asked for one`, "field" in shape);
      ok(`${code} is not asked optionally`, !shape.field.isOptional());
      ok(
        `${code} names every field it may answer`,
        TOPIC_FIELDS.every((f) => shape.field.description?.includes(f)),
      );
    }
    // The schema is permissive on purpose - an enum would let a stray label
    // fail a whole generation - so the coercion is what keeps the data clean.
    check("an invented domain lands on other", asTopicField("astrology"), "other");
    check("so does nothing at all", asTopicField(undefined), "other");
    check("so does the wrong type", asTopicField(42), "other");
    check("a real one passes through", asTopicField("payments"), "payments");
    ok("other is never authored", !(FIELDS as string[]).includes("other"));
  }

  console.log("\n--- the column lands on an existing database ---");
  {
    const Database = (await import("better-sqlite3")).default;
    const file = join(process.env.DATA_DIR!, "fluent.sqlite");

    // The shape the table had before this feature, with a row already in it.
    const old = new Database(file);
    old.exec(`
      CREATE TABLE pieces (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, language TEXT NOT NULL,
        format TEXT NOT NULL, topic TEXT NOT NULL, level REAL NOT NULL,
        title TEXT NOT NULL, body TEXT NOT NULL, glossary TEXT NOT NULL,
        questions TEXT NOT NULL, report TEXT NOT NULL, model TEXT,
        created_at TEXT NOT NULL
      );
    `);
    old
      .prepare(
        `INSERT INTO pieces (id,user_id,language,format,topic,level,title,body,glossary,questions,report,created_at)
         VALUES ('p1','u1','es','story','an old topic',30,'T','[]','[]','[]','{}','2026-01-01T00:00:00Z')`,
      )
      .run();
    old.close();

    const { getDb } = await import("../src/server/db");
    const db = getDb();

    const columns = (db.prepare("PRAGMA table_info(pieces)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    ok("topic_field was added", columns.includes("topic_field"));

    const rows = listPieces("u1", "es");
    check("the old row survives the migration", rows.length, 1);
    check("...with a null field", rows[0]!.topic_field, null);

    const history = toTopicHistory(rows);
    check("which reshapes to null, not a string", history[0]!.field, null);
    check("and keeps the topic", history[0]!.topic, "an old topic");

    db.prepare(
      `INSERT INTO pieces (id,user_id,language,format,topic,topic_field,level,title,body,glossary,questions,report,created_at)
       VALUES ('p2','u1','es','story','a new topic','payments',30,'T','[]','[]','[]','{}','2026-02-01T00:00:00Z')`,
    ).run();
    const both = toTopicHistory(listPieces("u1", "es"));
    check("newest first", both[0]!.topic, "a new topic");
    check("with its field", both[0]!.field, "payments");
    check("the older one still votes for nothing", both[1]!.field, null);
  }

  console.log(failures ? `\n${failures} failing` : "\nthe chips follow the reader");
  process.exit(failures ? 1 : 0);
}

void main();
