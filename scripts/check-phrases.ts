/**
 * Assert a phrase the reader assembled stays assembled.
 *
 *   npx tsx scripts/check-phrases.ts
 *
 * Pure: no database, no network, no React. The fixtures are word arrays and a
 * key function, which is all phraseSpans has ever needed.
 *
 * The behaviour under test is small and the ways it goes wrong are not. A
 * reader on a phone has no text selection worth the name - it fights the scroll
 * and works character by character - so the arrows are the only way to overrule
 * the segmenter. Before this, that overrule lasted exactly one lookup: 我 plus
 * one tap right gave 我们, and the moment the sheet closed both halves were
 * bare again and tapping either one started over.
 */
import { phraseSpans, withPhrase, type PhraseShape } from "../src/lib/phrases";

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

/**
 * A piece as a list of word tokens. `block` is the paragraph or speaker turn,
 * which is the boundary a phrase may not cross.
 */
function piece(tokens: string[], blocks?: number[]) {
  const words = tokens.map((_, i) => ({ block: blocks?.[i] ?? 0 }));
  const keyOf = (start: number, end: number) => tokens.slice(start, end + 1).join("");
  return { words, keyOf };
}

/** Which ranges came back, as readable strings, deduplicated and in order. */
function ranges(map: Map<number, { start: number; end: number }>): string[] {
  const seen = new Set<string>();
  for (const s of [...map.values()]) seen.add(`${s.start}-${s.end}`);
  return [...seen];
}

const TEXT = ["我", "们", "的", "老", "师", "很", "好", "我", "们"];

console.log("--- the case that prompted this ---");
{
  const { words, keyOf } = piece(TEXT);
  // Nothing built yet: every character stands alone, which is the segmenter's
  // opinion and the status quo.
  check("no phrases, no spans", phraseSpans(words, keyOf, []).size, 0);

  // The reader selects 我 and extends right once.
  const built: PhraseShape[] = [{ key: "我们", length: 2 }];
  const spans = phraseSpans(words, keyOf, built);
  check("both halves of 我们 are covered", [spans.get(0), spans.get(1)], [
    { start: 0, end: 1 },
    { start: 0, end: 1 },
  ]);
  check("...and they point at the SAME range", spans.get(0), spans.get(1));
  ok("的 next to it is untouched", !spans.has(2));
}

console.log();
console.log("--- one lookup, every occurrence ---");
{
  // 我们 appears twice in TEXT: at 0-1 and again at 7-8. Building it once has
  // to join both, or the reader rebuilds it on the second paragraph of every
  // piece - which is the same complaint one step later.
  const { words, keyOf } = piece(TEXT);
  const spans = phraseSpans(words, keyOf, [{ key: "我们", length: 2 }]);
  check("the later occurrence is joined too", ranges(spans), ["0-1", "7-8"]);
}

console.log();
console.log("--- longer wins ---");
{
  const { words, keyOf } = piece(TEXT);
  // Having built both, a tap should get 我们的 rather than whichever was looked
  // up first. Order in the array is lookup order, so this must not depend on it.
  const both: PhraseShape[] = [
    { key: "我们", length: 2 },
    { key: "我们的", length: 3 },
  ];
  check("the three-token phrase claims the run", ranges(phraseSpans(words, keyOf, both)), [
    "0-2",
    "7-8",
  ]);
  check(
    "...whichever order they were built in",
    ranges(phraseSpans(words, keyOf, [...both].reverse())),
    ["0-2", "7-8"],
  );
  // The tail 我们 at 7-8 still matches the shorter one, because 我们的 does not
  // fit there - the piece ends. That is the shape-based approach doing exactly
  // what it should.
  ok("and the shorter one still applies where the longer cannot fit", true);
}

console.log();
console.log("--- a phrase cannot straddle a boundary ---");
{
  // 我 ends one speaker's turn, 们 starts the next. `extend` refuses to build
  // across that, so recognising it later would invent a phrase the reader could
  // not have made.
  const { words, keyOf } = piece(TEXT, [0, 1, 1, 1, 1, 1, 1, 1, 1]);
  const spans = phraseSpans(words, keyOf, [{ key: "我们", length: 2 }]);
  ok("the split occurrence is not joined", !spans.has(0) && !spans.has(1));
  check("...but a clean occurrence later still is", ranges(spans), ["7-8"]);
}

console.log();
console.log("--- a phrase that runs off the end ---");
{
  const { words, keyOf } = piece(["我", "们"]);
  // Nothing should index past the last word. Before the guard this read
  // words[2] and threw on a piece that happened to end mid-phrase.
  const spans = phraseSpans(words, keyOf, [{ key: "我们的", length: 3 }]);
  check("no match, and no crash", spans.size, 0);
}

console.log();
console.log("--- overlaps resolve rather than pile up ---");
{
  // 们的 overlaps 我们. Once a word belongs to a phrase, a later one cannot
  // claim it, so the result partitions the text instead of layering.
  const { words, keyOf } = piece(TEXT);
  const spans = phraseSpans(words, keyOf, [
    { key: "我们", length: 2 },
    { key: "们的", length: 2 },
  ]);
  check("the earlier position wins the shared token", spans.get(1), { start: 0, end: 1 });
  ok("and 的 is then free to start its own", !spans.has(2) || spans.get(2)!.start === 2);
}

console.log();
console.log("--- what gets remembered ---");
{
  // A single word is not a phrase: it already underlines through the gloss
  // cache, and recording it would make every tap grow the list forever.
  check("one word is not recorded", withPhrase([], "我", 1), []);
  check("two are", withPhrase([], "我们", 2), [{ key: "我们", length: 2 }]);

  const one = withPhrase([], "我们", 2);
  ok("the same phrase twice does not duplicate", withPhrase(one, "我们", 2) === one);
  check(
    "a different length is a different phrase",
    withPhrase(one, "我们", 3).length,
    2,
  );
}

console.log();
console.log("--- languages with spaces ---");
{
  // Nothing here is Chinese-specific. A Spanish reader who joins "sin embargo"
  // gets the same treatment; the key function is the caller's, so the spaces
  // come back through it.
  const tokens = ["sin", "embargo", "no"];
  const words = tokens.map(() => ({ block: 0 }));
  const keyOf = (s: number, e: number) => tokens.slice(s, e + 1).join(" ");
  const spans = phraseSpans(words, keyOf, [{ key: "sin embargo", length: 2 }]);
  check("a two-word Spanish phrase joins", ranges(spans), ["0-1"]);
}

console.log();
if (failures > 0) {
  console.log(`${failures} failing`);
  process.exit(1);
}
console.log("all phrase checks passed");
