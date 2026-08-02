/**
 * Hand-written graded samples for the read-back check.
 *
 *   LANGUAGE=zh-CN npx tsx scripts/write-samples.ts
 *   LANGUAGE=zh-CN npx tsx scripts/write-samples.ts --write
 *
 * The alternative, scripts/build-samples.ts, asks a model for these. That is
 * fine for a first pass but wrong as a permanent arrangement: these five
 * paragraphs are a fixed, committed asset that the placement estimate leans on
 * heavily, so they should be written deliberately and then verified, not
 * regenerated on a whim and re-verified each time.
 *
 * Written to be graded on BOTH axes the level model cares about:
 *
 *  - vocabulary, which `measure()` checks against the frequency list, and
 *  - grammar, which it does not check at all. A text can sit perfectly inside
 *    the vocabulary band and still be far too hard because of what it does with
 *    it, so each sample deliberately stays inside the constructions its level
 *    unlocks (see the `grammar` gates in src/lib/languages/zh-CN.ts).
 *
 * Different topics on purpose: sharing one topic across the ladder lets a
 * reader infer the hard version from the easy one, which inflates the very
 * self-assessment the check exists to correct.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { paramsFor } from "../src/lib/level";
import { measure, BUDGET_SLACK } from "../src/server/difficulty";
import { DEFAULT_LANGUAGE, getLanguage } from "../src/lib/languages";

interface Written {
  level: number;
  topic: string;
  /** Which constructions this deliberately sticks to, for the next editor. */
  grammar: string;
  text: string;
}

const SAMPLES: Record<string, Written[]> = {
  "zh-CN": [
    {
      level: 10,
      // Written from the corpus's own high-frequency words rather than from a
      // textbook's first unit. This list is subtitles, so ordinary household
      // nouns - 桌子, 床, 星期六 - are far rarer in it than conversational verbs
      // and particles, and a "beginner" text full of them measures as hard.
      topic: "a quiet day at home with family",
      grammar: "plain SVO, 是/有, 不/没, 的 — deliberately no 了 or aspect markers",
      text:
        "我是学生。我家有四个人。我爸爸妈妈都很好，我还有一个哥哥。" +
        "今天我不去学校，我在家。我想看电视，可是我没有时间。" +
        "我要帮我妈妈，她说她很累。我说没关系，我可以做。" +
        "我哥哥不在家，他和朋友在外面。晚上他回家，我们都很高兴。" +
        "我觉得这样的一天很好。",
    },
    {
      level: 28,
      topic: "a neighbour's dog that keeps getting out",
      grammar: "adds 了 and 在, measure words, 会/能/可以",
      text:
        "我们旁边住着一个老人，他有一只狗。那只狗很喜欢跑出来。" +
        "上个月，它又跑到我们家门口了。我看见它在吃东西，就叫了老人。" +
        "他很快就来了，说他也没有办法。他的门太旧，狗每次都能出来。" +
        "后来他找人把门做好了。现在那只狗还是每天在外面玩，" +
        "可是它不能再进来了。",
    },
    {
      level: 47,
      topic: "a family bakery closing after forty years",
      grammar: "adds 把, resultative complements (关门, 走进), 虽然…但是",
      text:
        "街角那家面包店开了四十年，上个月关门了。" +
        "老板年纪大了，想回老家休息。" +
        "虽然很多老客人来跟他说再见，但是他还是决定不做了。" +
        "他说现在的年轻人喜欢去大超市买东西，很少有人走进这样的小店。" +
        "关门那天，他把最后一批面包送给了邻居。" +
        "大家吃着面包，心里都有点难过。",
    },
    {
      level: 66,
      topic: "how a city changed after an old railway was removed",
      grammar: "adds 被, 得 for manner, directional complements, relative clauses with 的",
      text:
        "那条旧铁路被拆掉以后，我们这座城市完全变了样子。" +
        "以前火车经过的地方，现在建成了一个很长的公园。" +
        "每天早上都有人在那里跑步，晚上老人们坐在长椅上聊天。" +
        "孩子们跑得很快，笑声传得很远。" +
        "住在附近的居民说，空气比从前干净多了，晚上也睡得更好。",
    },
    {
      level: 85,
      topic: "two friends arguing about moving abroad",
      grammar: "adds 是…的 for emphasis, 连…都, four-character idioms used sparingly",
      text:
        "李明打算移民，这个决定让他的老朋友张伟十分不解。" +
        "张伟认为，他们是从小一起长大的，连最困难的日子都熬过来了，如今却要各奔东西。" +
        "李明解释说，他并不是一时冲动才做出这个选择的，而是考虑了整整两年。" +
        "他说，人总要为自己的将来负责。" +
        "张伟沉默了很久，最后只说了一句：无论你走多远，这里永远是你的家。",
    },
  ],
};

async function main() {
  const code = process.env.LANGUAGE ?? DEFAULT_LANGUAGE;
  const language = getLanguage(code);
  const written = SAMPLES[code];
  if (!written) {
    throw new Error(
      `No hand-written samples for "${code}". Known: ${Object.keys(SAMPLES).join(", ")}`,
    );
  }

  console.log(`${language.name} (${code}) - ${written.length} samples\n`);

  let failures = 0;
  const out = written.map((s) => {
    const params = paramsFor(s.level, language);
    const report = measure(s.text, params);
    const ceiling = params.newWordBudget * BUDGET_SLACK;
    const ok = report.outOfBandRate <= ceiling;
    if (!ok) failures++;

    console.log(
      `${ok ? "ok  " : "OVER"} level ${String(s.level).padStart(3)} ${params.label.padEnd(6)} ` +
        `${String(report.totalWords).padStart(3)}w  ` +
        `${(report.outOfBandRate * 100).toFixed(1).padStart(5)}% out-of-band ` +
        `(ceiling ${(ceiling * 100).toFixed(1)}%)  ` +
        `band ${params.vocabBand.toLocaleString()}  sent ${report.meanSentenceWords.toFixed(1)}`,
    );
    if (report.outOfBand.length) {
      console.log(`     beyond band: ${report.outOfBand.slice(0, 14).join(" ")}`);
    }

    return {
      level: s.level,
      topic: s.topic,
      label: params.label,
      vocabBand: params.vocabBand,
      text: s.text,
      outOfBandRate: report.outOfBandRate,
      passes: report.passes,
    };
  });

  // Difficulty must climb monotonically, or the read-back ladder is not a
  // ladder and asking "which is the last one you can follow" means nothing.
  console.log("\nmonotonic difficulty check:");
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1]!;
    const cur = out[i]!;
    const rising = cur.vocabBand > prev.vocabBand;
    if (!rising) failures++;
    console.log(
      `  ${rising ? "ok  " : "FAIL"} ${prev.label} -> ${cur.label} ` +
        `(band ${prev.vocabBand.toLocaleString()} -> ${cur.vocabBand.toLocaleString()})`,
    );
  }

  if (!process.argv.includes("--write")) {
    console.log(
      failures
        ? `\n${failures} problem(s); fix the text before writing.`
        : "\nAll within budget. Re-run with --write to save.",
    );
    process.exit(failures ? 1 : 0);
  }

  if (failures) {
    console.error(`\nRefusing to write: ${failures} problem(s).`);
    process.exit(1);
  }

  const dir = join("src", "data", code);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "samples.json"), JSON.stringify({ samples: out }, null, 2));
  console.log(`\nWrote ${dir}/samples.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
