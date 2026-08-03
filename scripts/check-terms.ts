/**
 * Assert protected topic terms behave, in both scripts.
 *
 *   npm run terms
 *
 * The whole feature rests on one claim: a word inside a declared term is not
 * counted as difficulty. Everything here checks that claim from a different
 * angle, plus the guards that stop "declare a term" becoming a way to smuggle
 * an arbitrarily hard text past the budget.
 */
import {
  isProtected,
  mergeTermTokens,
  missingTerms,
  termSpans,
} from "../src/lib/terms";
import { measure, MAX_TERMS, MAX_TERM_RATE } from "../src/server/difficulty";
import { paramsFor } from "../src/lib/level";
import { getLanguage } from "../src/lib/languages";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) console.log(`       expected ${e}\n       got      ${a}`);
}

function ok(name: string, condition: boolean, detail = "") {
  if (!condition) failures++;
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

console.log("--- spans ---");

check("finds every occurrence", termSpans("a b a", ["a"]), [
  { start: 0, end: 1 },
  { start: 4, end: 5 },
]);

check("merges overlapping terms", termSpans("stablecoin", ["stable", "lecoin"]), [
  { start: 0, end: 10 },
]);

check("case-insensitive", termSpans("Tipo de cambio hoy", ["tipo de cambio"]), [
  { start: 0, end: 14 },
]);

// The reason spans exist at all: the segmenter splits this compound, so a
// token-equality check would protect nothing.
check("multi-token CJK compound", termSpans("我买稳定币了", ["稳定币"]), [
  { start: 2, end: 5 },
]);

check("a term that never appears yields nothing", termSpans("hola", ["adios"]), []);
check("empty and blank terms are ignored", termSpans("hola", ["", "  "]), []);

console.log("\n--- overlap test ---");
{
  const spans = termSpans("我买稳定币了", ["稳定币"]);
  ok("word inside the term is protected", isProtected(spans, 2, 2)); // 稳定
  ok("second half is protected too", isProtected(spans, 4, 1)); // 币
  ok("word before is not", !isProtected(spans, 1, 1)); // 买
  ok("word after is not", !isProtected(spans, 5, 1)); // 了
}

console.log("\n--- token merging ---");
{
  const zh = getLanguage("zh-CN");
  const text = "我买稳定币了。";
  const tokens = zh.tokenize(text);
  const merged = mergeTermTokens(tokens, termSpans(text, ["稳定币"]));

  ok(
    "merging still round-trips the text exactly",
    merged.map((t) => t.text).join("") === text,
    JSON.stringify(merged.map((t) => t.text)),
  );
  ok(
    "the term is one token",
    merged.some((t) => t.text === "稳定币" && t.isWord),
    JSON.stringify(merged.map((t) => t.text)),
  );
  ok(
    "the segmenter would have split it",
    !tokens.some((t) => t.text === "稳定币"),
    JSON.stringify(tokens.map((t) => t.text)),
  );
}

console.log("\n--- measurement ---");
{
  // Spanish at level 20: a small band, so the domain words below are all well
  // outside it and would normally blow the budget.
  const params = paramsFor(20, getLanguage("es"));
  const TERMS = ["criptomoneda", "cartera digital"];
  const text = (
    "Ana quiere pagar a su amigo en otro pais. " +
    "Ella usa una criptomoneda para enviar el dinero. " +
    "El dinero llega a la cartera digital de su amigo en un minuto. " +
    "Ana dice que es facil y rapido usar la criptomoneda hoy. "
  ).repeat(2);

  const without = measure(text, params);
  const withTerms = measure(text, params, TERMS);

  ok(
    "domain words count as difficulty when undeclared",
    without.outOfBandRate > withTerms.outOfBandRate,
    `${(without.outOfBandRate * 100).toFixed(1)}% -> ${(withTerms.outOfBandRate * 100).toFixed(1)}%`,
  );
  ok(
    "declaring them counts them as terms instead",
    withTerms.termWords > 0,
    `${withTerms.termWords} term words, ${(withTerms.termRate * 100).toFixed(1)}%`,
  );
  ok(
    "the word total is unchanged - the reader still reads them",
    without.totalWords === withTerms.totalWords,
    `${withTerms.totalWords} words`,
  );
  ok(
    "a protected term is never listed back as a word to replace",
    !withTerms.outOfBand.includes("criptomoneda"),
    withTerms.outOfBand.slice(0, 6).join(", "),
  );
}

console.log("\n--- the guards on declaring a term ---");
{
  const params = paramsFor(20, getLanguage("es"));
  const text = "Ana usa una criptomoneda hoy. ".repeat(8);

  const absent = measure(text, params, ["criptomoneda", "banco central"]);
  ok(
    "a declared term that never appears is a problem",
    absent.problems.some((p) => /never appear/i.test(p)),
    absent.missingTerms.join(", "),
  );
  check("...and is reported", absent.missingTerms, ["banco central"]);

  const many = measure(text, params, Array.from({ length: MAX_TERMS + 1 }, (_, i) => `t${i}`));
  ok(
    `more than ${MAX_TERMS} distinct terms is a problem`,
    many.problems.some((p) => /too many/i.test(p)),
  );

  // Almost every word is a declared term: rules satisfied, but it is a
  // definition list rather than something to read.
  const jargon = "criptomoneda cartera digital blockchain ".repeat(10);
  const padded = measure(jargon, params, ["criptomoneda", "cartera digital", "blockchain"]);
  ok(
    `terms over ${(MAX_TERM_RATE * 100).toFixed(0)}% of the text is a problem`,
    padded.problems.some((p) => /key terms \(limit/i.test(p)),
    `${(padded.termRate * 100).toFixed(0)}% terms`,
  );
}

console.log("\n--- missingTerms ---");
check("case and spacing tolerant", missingTerms("Una Criptomoneda.", ["  criptomoneda "]), []);
check("reports what is absent", missingTerms("hola", ["banco"]), ["banco"]);

console.log(failures ? `\n${failures} failing` : "\nprotected terms behave as expected");
process.exit(failures ? 1 : 0);
