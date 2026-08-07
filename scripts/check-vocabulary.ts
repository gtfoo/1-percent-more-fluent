/**
 * Assert the looked-up word list behaves.
 *
 *   npm run vocab
 *
 * Runs against a scratch database built here, not the real one - the point is to
 * assert on shapes that do not exist yet in anyone's history, like the same word
 * tapped across three pieces.
 *
 * The imports are dynamic and inside main() for one reason: paths.ts reads
 * DATA_DIR once, at module load, so db.ts must not be pulled in until the
 * scratch directory is set. These scripts compile to CJS, so there is no
 * top-level await to do it with.
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

async function main() {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "fluent-vocab-"));
  process.env.AUDIO_DIR = join(process.env.DATA_DIR, "audio");

  const { getDb } = await import("../src/server/db");
  const { listVocabulary, countVocabulary, forgetWord, toTsv } = await import(
    "../src/server/vocabulary"
  );
  const { cacheKey } = await import("../src/server/gloss");
  const { getLanguage } = await import("../src/lib/languages");

  const db = getDb();

  const piece = (id: string, language: string, userId = "u1") =>
    db
      .prepare(
        `INSERT INTO pieces (id, user_id, language, format, topic, level, title,
                             body, glossary, questions, report, created_at)
         VALUES (?, ?, ?, 'story', 't', 30, 'T', '[]', '[]', '[]', '{}', ?)`,
      )
      .run(id, userId, language, new Date().toISOString());

  const lookup = (pieceId: string, word: string, at: string, userId = "u1") =>
    db
      .prepare(
        "INSERT INTO lookups (user_id, piece_id, word, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(userId, pieceId, word, at);

  const gloss = (language: string, word: string, entry: object) =>
    db
      .prepare(
        "INSERT INTO gloss_cache (language, word, meaning, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(language, word, JSON.stringify(entry), new Date().toISOString());

  // Two languages for one reader, because the list is per-language and lookups
  // has no language column - it is reached through the piece it happened in.
  piece("p1", "zh-CN");
  piece("p2", "zh-CN");
  piece("p3", "zh-CN");
  piece("p4", "es");
  piece("p5", "zh-CN", "u2"); // another reader, to prove the list is not global

  lookup("p1", "屏蔽", "2026-08-01T00:00:00Z");
  lookup("p2", "屏蔽", "2026-08-02T00:00:00Z");
  lookup("p3", "屏蔽", "2026-08-03T00:00:00Z");
  lookup("p1", "滞后", "2026-08-04T00:00:00Z");
  lookup("p1", "媲美", "2026-08-05T00:00:00Z"); // deliberately never glossed
  lookup("p4", "taquilla", "2026-08-06T00:00:00Z");
  lookup("p5", "别的", "2026-08-07T00:00:00Z", "u2");

  gloss("zh-CN", "屏蔽", { meaning: "to block / shield", pronunciation: "píng bì" });
  gloss("zh-CN", "滞后", { meaning: "time lag / delay", pronunciation: "zhì hòu" });
  gloss("es", "taquilla", { meaning: "box office" });

  console.log("--- the list ---");
  const zh = listVocabulary("u1", "zh-CN");

  check("newest first", zh.map((e) => e.word), ["媲美", "滞后", "屏蔽"]);
  check("only this language", listVocabulary("u1", "es").map((e) => e.word), [
    "taquilla",
  ]);
  check("only this reader", listVocabulary("u2", "zh-CN").map((e) => e.word), ["别的"]);

  const shielded = zh.find((e) => e.word === "屏蔽")!;
  check("counts the pieces it was needed in", shielded.pieces, 3);
  check("carries the cached meaning", shielded.meaning, "to block / shield");
  check("carries the derived pinyin", shielded.pronunciation, "píng bì");

  // The row that motivated the LEFT JOIN. Dropping it would hide a word the
  // reader demonstrably struggled with, which is the opposite of the point.
  const ungossed = zh.find((e) => e.word === "媲美")!;
  ok("a word with no cached gloss still appears", ungossed !== undefined);
  check("...with no meaning rather than a missing row", ungossed.meaning, null);
  ok("...and no pronunciation key at all", !("pronunciation" in ungossed));

  check(
    "a language with no pronunciation gets none",
    "pronunciation" in listVocabulary("u1", "es")[0]!,
    false,
  );

  check("the count agrees with the list", countVocabulary("u1", "zh-CN"), zh.length);
  check("counting an empty language", countVocabulary("u1", "de"), 0);
  check("listing an empty language", listVocabulary("u1", "de"), []);

  console.log("\n--- forgetting ---");
  forgetWord("u1", "zh-CN", "屏蔽");
  check(
    "the word goes from every piece at once",
    listVocabulary("u1", "zh-CN").map((e) => e.word),
    ["媲美", "滞后"],
  );
  check("...and from the count", countVocabulary("u1", "zh-CN"), 2);

  forgetWord("u1", "zh-CN", "taquilla");
  check(
    "forgetting is scoped to the language",
    listVocabulary("u1", "es").map((e) => e.word),
    ["taquilla"],
  );

  forgetWord("u2", "zh-CN", "别的");
  check("...and to the reader", listVocabulary("u2", "zh-CN"), []);

  console.log("\n--- export ---");
  const remaining = listVocabulary("u1", "zh-CN");
  const tsv = toTsv(remaining);
  check("one line per word", tsv.split("\n").length, remaining.length);
  check("three columns", tsv.split("\n")[0]!.split("\t").length, 3);
  check("word, reading, meaning", tsv.split("\n")[1], "滞后\tzhì hòu\ttime lag / delay");
  // Anki maps fields by position, so a header row would import as a card.
  ok("no header row", !tsv.startsWith("word"));

  check(
    "tabs and newlines inside a field are neutralised",
    toTsv([{ word: "a\tb", meaning: "one\ntwo", pieces: 1, lastSeen: "x" }]),
    "a b\t\tone two",
  );
  check("nothing to export is an empty file", toTsv([]), "");

  console.log("\n--- lookups are keyed the way glosses are ---");
  // The bug this closes: recordLookup normalised while glossWord cached under
  // cacheKey. They agree for one word and diverge for a phrase, so a multi-word
  // selection was recorded under a key that could never find its own meaning.
  const es = getLanguage("es");
  check(
    "a single word is unchanged",
    cacheKey(es, "Taquilla"),
    es.normalizeWord("Taquilla"),
  );
  ok(
    "a phrase survives, where normalizeWord would flatten it",
    cacheKey(es, "tipo de cambio") === "tipo de cambio" &&
      es.normalizeWord("tipo de cambio") !== "tipo de cambio",
    `normalizeWord gives "${es.normalizeWord("tipo de cambio")}"`,
  );
  check("Chinese single word", cacheKey(getLanguage("zh-CN"), "屏蔽"), "屏蔽");
  // The regex behind it needed a /g: without it only the first run of
  // non-letters went, so a string with two of them came out half-cleaned.
  check("every run of non-letters is stripped", es.normalizeWord("¡qué tal!"), "quétal");

  console.log(failures ? `\n${failures} failing` : "\nthe word list behaves as expected");
  process.exit(failures ? 1 : 0);
}

void main();
