import Database from "better-sqlite3";
import { paramsFor } from "../src/lib/level";
import { getLanguage } from "../src/lib/languages";
import { BUDGET_SLACK, BUDGET_FLOOR } from "../src/server/difficulty";

const db = new Database("data/fluent.sqlite", { readonly: true });
const row = db
  .prepare(
    "SELECT title, level, model, language, terms, report FROM pieces ORDER BY created_at DESC LIMIT 1",
  )
  .get() as
  | {
      title: string;
      level: number;
      model: string;
      language: string;
      terms: string | null;
      report: string;
    }
  | undefined;

if (!row) {
  console.error("no pieces");
  process.exit(1);
}

const report = JSON.parse(row.report);
// The piece's own language, not a default - a Chinese piece measured against
// Spanish parameters would report nonsense.
const params = paramsFor(row.level, getLanguage(row.language));
const floor = params.newWordBudget * BUDGET_FLOOR;
const ceiling = params.newWordBudget * BUDGET_SLACK;
const rate = report.outOfBandRate;
const inWindow = rate >= floor && rate <= ceiling;

console.log(`"${row.title}"  [${row.model}]  level ${row.level.toFixed(0)}`);
console.log(`  ${report.totalWords} words, mean sentence ${report.meanSentenceWords.toFixed(1)}`);
console.log(
  `  out-of-band ${(rate * 100).toFixed(1)}%  ` +
    `window ${(floor * 100).toFixed(1)}%-${(ceiling * 100).toFixed(1)}%  ` +
    `${inWindow ? "INSIDE" : "OUTSIDE"}  passes=${report.passes}`,
);
// The terms are what the piece set out to teach, so they are the first thing
// worth eyeballing: whether they are the words you would actually need to use
// the topic with someone, or merely words related to it.
const terms = JSON.parse(row.terms ?? "[]") as { term: string; meaning: string }[];
if (terms.length) {
  console.log(
    `  ${terms.length} key terms, ${(report.termRate * 100 || 0).toFixed(0)}% of the text:`,
  );
  for (const t of terms) console.log(`    ${t.term} - ${t.meaning}`);
} else {
  console.log("  no key terms (generated before topic terms, or none declared)");
}

if (report.problems?.length) console.log(`  problems: ${report.problems.join(" | ")}`);
process.exit(inWindow ? 0 : 1);
