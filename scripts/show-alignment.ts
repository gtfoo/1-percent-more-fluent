/**
 * Print an alignment character by character, with the gap each one occupies.
 *
 *   npx tsx scripts/show-alignment.ts <hash-prefix> [limit]
 *
 * For eyeballing whether the timings describe plausible speech, rather than
 * whether the characters line up (that is check-alignment.ts).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const prefix = process.argv[2];
const limit = Number(process.argv[3] ?? 60);
if (!prefix) {
  console.error("usage: show-alignment.ts <hash-prefix> [limit]");
  process.exit(1);
}

const file = readdirSync("data/audio").find(
  (f) => f.startsWith(prefix) && f.endsWith(".json"),
);
if (!file) {
  console.error(`no alignment starting ${prefix}`);
  process.exit(1);
}

const { characters, ends } = JSON.parse(
  readFileSync(join("data/audio", file), "utf8"),
) as { characters: string[]; ends: number[] };

console.log(`${file}: ${characters.length} entries, ends at ${ends[ends.length - 1]}s\n`);

let prev = 0;
const gaps: number[] = [];
for (let i = 0; i < characters.length; i++) {
  const gap = ends[i]! - prev;
  gaps.push(gap);
  if (i < limit) {
    console.log(
      `${String(i).padStart(4)}  ${JSON.stringify(characters[i]).padEnd(8)} ` +
        `end ${ends[i]!.toFixed(3).padStart(8)}  gap ${gap.toFixed(3).padStart(7)}`,
    );
  }
  prev = ends[i]!;
}

const sorted = [...gaps].sort((a, b) => a - b);
const zero = gaps.filter((g) => g === 0).length;
console.log(
  `\ngaps: min ${sorted[0]!.toFixed(3)}  median ${sorted[sorted.length >> 1]!.toFixed(3)}  ` +
    `max ${sorted[sorted.length - 1]!.toFixed(3)}  zero-length ${zero}/${gaps.length}`,
);
