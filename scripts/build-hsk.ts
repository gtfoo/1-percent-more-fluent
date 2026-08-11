/**
 * Build the Chinese placement test from the official HSK 3.0 word list.
 *
 *   npm run hsk
 *
 * WHY THIS EXISTS. Every other language here is banded by frequency rank in an
 * OpenSubtitles corpus, and for Chinese that produced a test nobody could fail.
 * Its hardest band - notionally ranks 11,001-20,000, the far end of the scale -
 * held four words: 不便, 安好, 指头, 往日. Those are ordinary. A subtitle corpus
 * simply does not contain 9,000 genuinely rare Chinese words to put there, so
 * the top of the scale was measuring nothing and everyone reached it.
 *
 * HSK 3.0 replaces the ruler with one somebody built on purpose. It is ordered
 * pedagogically rather than by how often a word turns up in film dialogue, it
 * is the scale Chinese learners already describe themselves with, and its top
 * band is genuinely the top: 彬彬有礼, 变幻莫测, 暴风骤雨 rather than 指头.
 *
 * It also settles the 成语 question. Four-character idioms are part of the
 * standard's 7-9 band - 430-odd of them - so they arrive on their own merits
 * rather than being bolted on, and a learner who claims 半途而败 while missing
 * 半途而废 is telling us something a frequency list never could.
 *
 * NO MODEL CALL. build-wordlist.ts has to ask a model whether a sampled Chinese
 * item is a real word, because a subtitle list is full of names and fragments.
 * A curated official standard needs no such vetting - every entry is a word
 * somebody put there deliberately - so this script is free to run and offline
 * apart from the one download.
 *
 * SOURCE AND LICENCE. github.com/ivankra/hsk30, MIT, which is a cleaned and
 * cross-validated parse of the official PDF of 《国际中文教育中文水平等级标准》
 * (GF 0025-2021), published by 教育部 and 国家语言文字工作委员会. The MIT notice
 * is reproduced in NOTICE.md, which that licence requires and which is the
 * reason this data is vendored rather than quietly copied.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CSV = "https://raw.githubusercontent.com/ivankra/hsk30/master/hsk30.csv";
const OUT = join(process.cwd(), "src", "data", "zh-CN");

/**
 * The seven bands of HSK 3.0, and where each ends in the cumulative list.
 *
 * These are the standard's own counts, not rounded marketing ones: 500 words at
 * level 1, then 772 more, 973 more, and so on to 5,636 across 7-9 for 11,092
 * altogether. Several summaries of HSK 3.0 quote 300/500/1,000/2,000/3,600/
 * 5,400 instead - those are a different figure, and they do not match what is
 * actually in the standard's word list.
 *
 * `through` is the cumulative position of the last word in the band, which is
 * what the placement scorer needs: it credits a band by its WIDTH, so the
 * widths have to be the real ones.
 */
const LEVELS = ["1", "2", "3", "4", "5", "6", "7-9"] as const;

/**
 * 7-9 is split in two before it is tested, and the other six are not.
 *
 * The standard publishes levels 7, 8 and 9 as one undivided pool of 5,636
 * words - half the whole list. Tested with five items, that band credits 1,120
 * words per "yes", so a single lucky recognition moves the estimate more than
 * all of HSK 1 and 2 together. That is exactly where readers were topping out,
 * and topping out there is not a measurement.
 *
 * The split is by frequency WITHIN the band, using the subtitle list this
 * project already carries. That list is a poor ruler for absolute vocabulary
 * size - which is why it is no longer used as one - but it is perfectly good at
 * the only question asked of it here: of two words the standard puts at the
 * same level, which do you meet more often? Anything the corpus has never seen
 * is rare by construction and sorts to the far half.
 *
 * The 成语 fall out of this rather than being placed. Four-character idioms are
 * mostly absent from film dialogue, so they land in the rarer half and finally
 * appear in the test - which is what makes the top band worth answering.
 */
const SPLIT_LAST = true;

/** Words per band shown in the test, and the pool each is sampled from. */
const POOL_PER_BAND = 12;

interface Entry {
  word: string;
  level: string;
}

function parse(csv: string): Entry[] {
  const lines = csv.trim().split("\n");
  const head = lines[0]!.split(",");
  const iWord = head.indexOf("Simplified");
  const iLevel = head.indexOf("Level");
  const iPos = head.indexOf("POS");
  if (iWord < 0 || iLevel < 0) throw new Error("unexpected CSV columns");

  const seen = new Set<string>();
  const out: Entry[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const word = cells[iWord]?.trim();
    const level = cells[iLevel]?.trim();
    if (!word || !level) continue;

    // The standard uses ellipsis entries like "…分之…" for patterns rather than
    // words. They are real entries and useless as test items: nobody can say
    // whether they "know" a template.
    if (/[…\s]/.test(word)) continue;
    // A handful of rows carry a variant in the same cell; the first is the
    // headword. Also drop anything non-Han that slipped through the OCR.
    if (!/^[一-鿿]+$/.test(word)) continue;
    if (seen.has(word)) continue;

    seen.add(word);
    out.push({ word, level });
    void iPos;
  }
  return out;
}

/**
 * Deterministic sample. The pool baked into placement.json must not change
 * every time someone reruns the build - a test whose items churn silently is
 * one whose results cannot be compared across a week.
 */
function pick<T>(items: T[], n: number, seed: number): T[] {
  const pool = [...items];
  let h = seed || 1;
  for (let i = pool.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    const j = h % (i + 1);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, n);
}

/**
 * Word -> position in the subtitle frequency list, for ordering WITHIN a band.
 * Never for saying how many words anybody knows; see SPLIT_LAST.
 */
async function frequencyRanks(): Promise<Map<string, number>> {
  const list = JSON.parse(await readFile(join(OUT, "frequency.json"), "utf8")) as {
    words: string[];
  };
  const ranks = new Map<string, number>();
  list.words.forEach((w, i) => {
    if (!ranks.has(w)) ranks.set(w, i + 1);
  });
  return ranks;
}

async function main() {
  console.log(`fetching ${CSV}`);
  const res = await fetch(CSV);
  if (!res.ok) throw new Error(`HSK list download failed: ${res.status}`);
  const entries = parse(await res.text());

  const byLevel = new Map<string, string[]>();
  for (const e of entries) {
    if (!byLevel.has(e.level)) byLevel.set(e.level, []);
    byLevel.get(e.level)!.push(e.word);
  }

  for (const level of LEVELS) {
    if (!byLevel.get(level)?.length) throw new Error(`no words at HSK ${level}`);
  }

  // Split 7-9 by how often each word actually turns up, so the widest band
  // becomes two testable ones. See SPLIT_LAST.
  const rank = await frequencyRanks();
  const groups: { level: string; words: string[] }[] = [];
  for (const level of LEVELS) {
    const words = byLevel.get(level)!;
    if (!SPLIT_LAST || level !== "7-9") {
      groups.push({ level, words });
      continue;
    }
    const sorted = [...words].sort(
      (a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity),
    );
    const half = Math.ceil(sorted.length / 2);
    groups.push({ level: "7-9a", words: sorted.slice(0, half) });
    groups.push({ level: "7-9b", words: sorted.slice(half) });
  }

  // Cumulative positions. The scorer treats a band's width as the number of
  // words it stands for, so band N spans from wherever N-1 ended to its own
  // cumulative total.
  let cursor = 0;
  const bands = groups.map((g, i) => {
    const minRank = cursor + 1;
    cursor += g.words.length;
    return {
      level: g.level,
      minRank,
      maxRank: cursor,
      // Seeded per band so band 3 does not get band 2's shuffle.
      words: pick(g.words, POOL_PER_BAND, 7919 * (i + 1)),
    };
  });

  const total = cursor;
  console.log(`\n${entries.length} entries, ${total} after de-duplication`);
  for (const b of bands) {
    console.log(
      `  HSK ${b.level.padEnd(3)} ${String(b.minRank).padStart(6)}-${String(b.maxRank).padStart(6)}` +
        `  e.g. ${b.words.slice(0, 6).join(", ")}`,
    );
  }

  // The pseudowords are kept, not regenerated. They were produced by a model
  // once - a compound of two real characters that is not a real word, which
  // catches the specific Chinese over-claim of "I know both characters, so I
  // must know the word" - and they are independent of which real words sit
  // beside them. Rebuilding them would cost a model call to arrive at
  // something no better.
  const path = join(OUT, "placement.json");
  const existing = JSON.parse(await readFile(path, "utf8")) as {
    bands: { pseudowords: string[] }[];
  };
  const pool = [...new Set(existing.bands.flatMap((b) => b.pseudowords))];
  if (pool.length < bands.length * 2) {
    throw new Error(`only ${pool.length} pseudowords for ${bands.length} bands`);
  }
  console.log(`\nredistributing ${pool.length} existing pseudowords across ${bands.length} bands`);

  await writeFile(
    path,
    JSON.stringify(
      {
        source:
          "HSK 3.0 (GF 0025-2021, 教育部/国家语委) via https://github.com/ivankra/hsk30, MIT. See NOTICE.md.",
        note:
          "Bands are the standard's own levels, not frequency ranks. minRank/maxRank are " +
          "cumulative positions in the 11,092-word list, which is what the scorer credits by width.",
        bands: bands.map((b, i) => ({
          level: b.level,
          minRank: b.minRank,
          maxRank: b.maxRank,
          words: b.words,
          // Dealt round-robin so every band gets some even though the pool does
          // not divide evenly, and so the same band gets the same ones on a
          // rerun.
          pseudowords: pool.filter((_, j) => j % bands.length === i),
        })),
      },
      null,
      1,
    ) + "\n",
  );
  console.log(`wrote ${path}`);
}

void main();
