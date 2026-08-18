/**
 * Assert the prefetch machinery that can be asserted without a model: which
 * topic the follow-on gets, which length bucket it inherits, and that a parent
 * can only ever have one child to find.
 *
 *   npx tsx scripts/check-prefetch.ts
 *
 * The route's own guards (ownership as 404, finish-before-prefetch, idempotency
 * checked BEFORE the rate limit is spent) live in api/generate/next/route.ts
 * and are exercised by reading; the load-bearing derivations are here.
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
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "check-prefetch-"));
  const { followOnTopic, lengthLike, existingFollowOn, unreadFollowOn } = await import(
    "../src/server/generate"
  );
  const { getDb } = await import("../src/server/db");

  // --- the follow-on topic ---------------------------------------------------
  const piece = {
    id: "a-stable-id",
    topic: "el transporte público en Singapur",
    terms: [
      { term: "el metro", meaning: "the metro" },
      { term: "la tarifa", meaning: "the fare" },
      { term: "el andén", meaning: "the platform" },
    ],
  };

  const topic = followOnTopic(piece);
  ok("derived from a key term of the finished piece", /el metro|la tarifa|el andén/.test(topic), topic);
  ok("carries the term's meaning so the model is not guessing", /\(the (metro|fare|platform)\)/.test(topic));
  ok("names the parent topic for continuity", topic.includes("el transporte"));
  ok(
    "deterministic - same piece, same follow-on",
    followOnTopic(piece) === topic,
  );
  ok(
    "a different piece id picks differently or not - but never throws",
    typeof followOnTopic({ ...piece, id: "another-id" }) === "string",
  );
  ok(
    "a piece with no terms still gets a topic",
    followOnTopic({ id: "x", topic: "algo", terms: [] }).includes("algo"),
  );
  const longTopic = followOnTopic({
    id: "x",
    topic: "y".repeat(400),
    terms: [{ term: "z".repeat(100), meaning: "w".repeat(100) }],
  });
  // The generate routes cap learner topics at 200 characters; a derived topic
  // must live inside the same contract rather than being the one caller that
  // can exceed it.
  ok("clamped to the route's 200-char topic cap", longTopic.length <= 200, `${longTopic.length}`);

  // --- the length bucket -----------------------------------------------------
  ok("a ~180-word piece reads as short", lengthLike(170) === "short");
  ok("a ~350-word piece reads as medium", lengthLike(380) === "medium");
  ok("a ~600-word piece reads as long", lengthLike(650) === "long");
  ok("the midpoint breaks toward one bucket, not a crash", ["short", "medium"].includes(lengthLike(265)));

  // --- one child per parent, and it is findable ------------------------------
  const db = getDb();
  const [parent, child, user] = [randomUUID(), randomUUID(), randomUUID()];
  const insert = db.prepare(
    `INSERT INTO pieces (id, user_id, language, format, topic, level, title, body, glossary, questions, speakers, terms, report, model, parent_id, created_at)
     VALUES (?, ?, 'es', 'story', 't', 30, ?, '[]', '[]', '[]', '[]', '[]', '{}', 'm', ?, ?)`,
  );
  insert.run(parent, user, "the parent", null, new Date().toISOString());
  ok("no follow-on before one exists", existingFollowOn(parent) === null);

  insert.run(child, user, "the follow-on", parent, new Date().toISOString());
  const found = existingFollowOn(parent);
  ok("the follow-on is findable by its parent", found?.id === child);
  ok("...with the title the chip needs", found?.title === "the follow-on");
  ok("a child is not its own parent's parent", existingFollowOn(child) === null);

  // --- the home-page card: an unread follow-on is findable, a read one gone --
  // This query exists because the post-session chip measurably failed alone:
  // both live follow-ons landed after the reader had left the panel, unmarked.
  const found2 = unreadFollowOn(user, "es");
  ok("an unread follow-on surfaces for the home page", found2?.id === child);
  ok(
    "it is scoped to the reader",
    unreadFollowOn(randomUUID(), "es") === null,
  );
  ok("and to the language", unreadFollowOn(user, "zh-CN") === null);

  db.prepare(
    `INSERT INTO sessions (id, piece_id, user_id, level_before, level_after, lookup_rate, created_at)
     VALUES (?, ?, ?, 30, 30, 0.05, ?)`,
  ).run(randomUUID(), child, user, new Date().toISOString());
  ok(
    "once read, the card goes - a session is what 'read' means",
    unreadFollowOn(user, "es") === null,
  );

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failing`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
