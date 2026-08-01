import Database from "better-sqlite3";
import { paramsFor } from "../src/lib/level";
import { BUDGET_SLACK, BUDGET_FLOOR } from "../src/server/difficulty";

const db = new Database("data/fluent.sqlite", { readonly: true });
const row = db
  .prepare("SELECT title, level, model, report FROM pieces ORDER BY created_at DESC LIMIT 1")
  .get() as { title: string; level: number; model: string; report: string } | undefined;

if (!row) {
  console.error("no pieces");
  process.exit(1);
}

const report = JSON.parse(row.report);
const params = paramsFor(row.level);
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
if (report.problems?.length) console.log(`  problems: ${report.problems.join(" | ")}`);
process.exit(inWindow ? 0 : 1);
