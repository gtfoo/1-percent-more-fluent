/**
 * What the chips look like right now for real readers, and what the model has
 * been labelling topics as. Read-only, no LLM.
 */
import { getDb } from "../src/server/db";
import { listPieces, toTopicHistory } from "../src/server/generate";
import { rankAll } from "../src/lib/rank-suggestions";
import { SUGGESTIONS } from "../src/lib/suggestions";

console.log("--- what the model has labelled ---");
const rows = getDb()
  .prepare("SELECT topic, topic_field FROM pieces ORDER BY created_at DESC LIMIT 6")
  .all() as { topic: string; topic_field: string | null }[];
for (const r of rows) {
  console.log(`  ${String(r.topic_field ?? "(null)").padEnd(12)} ${r.topic.slice(0, 55)}`);
}

console.log("\n--- chips for readers who have history ---");
const readers = getDb()
  .prepare(
    "SELECT user_id, language, COUNT(*) n FROM pieces GROUP BY user_id, language ORDER BY n DESC LIMIT 3",
  )
  .all() as { user_id: string; language: string; n: number }[];

for (const r of readers) {
  const recent = listPieces(r.user_id, r.language);
  const history = toTopicHistory(recent);
  const chips = rankAll(history, `${r.user_id}:${recent.length}`);
  const labelled = history.filter((h) => h.field).length;
  const moved = chips.story.map((c) => c.label).join() !== SUGGESTIONS.story.map((c) => c.label).join();
  console.log(
    `  ${r.user_id.slice(0, 8)} ${r.language.padEnd(6)} ${r.n} pieces, ${labelled} labelled -> ${moved ? "REORDERED" : "authored order"}`,
  );
  console.log(`    ${chips.story.slice(0, 4).map((c) => c.label).join(" | ")}`);
}
