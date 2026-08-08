/**
 * What the model has been labelling topics as, and what that does to the chips.
 *
 *   npm run fields
 *
 * Read-only, no LLM. Two things worth watching:
 *
 *   - How often `other` comes back. A label of `other` votes for nothing, so if
 *     it dominates, affinity never engages and every reader quietly gets the
 *     authored order forever. That failure is silent by design - the fallback
 *     is the curated set - so it needs looking at rather than waiting for.
 *   - Chips per field per format. Affinity can only PROMOTE when a field has a
 *     second chip left unread; where a field has one chip and you have read it,
 *     all the ranker can do is demote it.
 */
import { getDb } from "../src/server/db";
import { listPieces, toTopicHistory } from "../src/server/generate";
import { rankAll } from "../src/lib/rank-suggestions";
import { SUGGESTIONS } from "../src/lib/suggestions";
import { FORMATS, type Format } from "../src/lib/formats";

console.log("--- how topics have been labelled ---");
const counts = getDb()
  .prepare(
    `SELECT COALESCE(topic_field, '(unlabelled)') AS f, COUNT(*) AS n
       FROM pieces GROUP BY f ORDER BY n DESC`,
  )
  .all() as { f: string; n: number }[];
for (const c of counts) console.log(`  ${String(c.n).padStart(4)}  ${c.f}`);

const recent = getDb()
  .prepare(
    "SELECT topic, topic_field FROM pieces WHERE topic_field IS NOT NULL ORDER BY created_at DESC LIMIT 8",
  )
  .all() as { topic: string; topic_field: string }[];
if (recent.length) {
  console.log("\n  most recent:");
  for (const r of recent) {
    console.log(`    ${r.topic_field.padEnd(12)} ${r.topic.slice(0, 55)}`);
  }
}

console.log("\n--- chips per field, per format ---");
for (const format of FORMATS) {
  const per = new Map<string, number>();
  for (const c of SUGGESTIONS[format as Format]) per.set(c.field, (per.get(c.field) ?? 0) + 1);
  const twice = [...per.entries()].filter(([, n]) => n > 1).map(([f]) => f);
  console.log(
    `  ${format.padEnd(13)} two chips in: ${twice.join(", ") || "none"} - only these can be promoted`,
  );
}

console.log("\n--- what each reader with a labelled history now sees ---");
const readers = getDb()
  .prepare(
    `SELECT user_id, language, COUNT(*) AS n FROM pieces
      WHERE topic_field IS NOT NULL AND topic_field != 'other'
      GROUP BY user_id, language ORDER BY n DESC LIMIT 3`,
  )
  .all() as { user_id: string; language: string; n: number }[];

if (!readers.length) console.log("  (nobody yet - every piece is unlabelled or other)");

for (const r of readers) {
  const rows = listPieces(r.user_id, r.language);
  const chips = rankAll(toTopicHistory(rows), `${r.user_id}:${rows.length}`);
  console.log(`\n  ${r.user_id.slice(0, 8)} (${r.language}), ${rows.length} pieces`);
  for (const format of FORMATS) {
    const now = chips[format as Format];
    const was = SUGGESTIONS[format as Format];
    const moved = now.map((c) => c.label).join() !== was.map((c) => c.label).join();
    console.log(`    ${format.padEnd(13)} ${moved ? "" : "(unchanged) "}${now
      .slice(0, 4)
      .map((c) => `${c.label}[${c.field}]`)
      .join(" | ")}`);
  }
}
