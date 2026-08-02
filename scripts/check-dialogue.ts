/**
 * Assert conversation turns split correctly, in every script we support.
 *
 *   npm run dialogue
 *
 * The split is load-bearing twice over: the speaker's name must never reach the
 * TTS (it is a label, not something anyone says aloud), and the offsets it
 * produces are the coordinate space the audio timings index into. A turn that
 * fails to split keeps the name inside the spoken text, so the narrator reads
 * "Xiao Ming" out loud and the name is rendered as prose the learner is
 * expected to know.
 */
import { splitTurns, spokenText, type Speaker } from "../src/lib/dialogue";

interface Case {
  name: string;
  speakers: Speaker[];
  paragraphs: string[];
  expect: { speaker: string | null; text: string }[];
}

const ZH: Speaker[] = [
  { name: "小明", gender: "male" },
  { name: "小红", gender: "female" },
];
const ES: Speaker[] = [
  { name: "Lucas", gender: "male" },
  { name: "Sofía", gender: "female" },
];

const CASES: Case[] = [
  {
    name: "spanish, ascii colon",
    speakers: ES,
    paragraphs: ["Lucas: ¡Hola!", "Sofía: ¿Qué tal?"],
    expect: [
      { speaker: "Lucas", text: "¡Hola!" },
      { speaker: "Sofía", text: "¿Qué tal?" },
    ],
  },
  {
    name: "chinese, ascii colon",
    speakers: ZH,
    paragraphs: ["小明: 你好！", "小红: 你好吗？"],
    expect: [
      { speaker: "小明", text: "你好！" },
      { speaker: "小红", text: "你好吗？" },
    ],
  },
  {
    // The one that actually bit. Chinese text uses the full-width colon, and a
    // model writing Chinese emits it without being asked. Matching only ":"
    // left the name inside the line.
    name: "chinese, full-width colon",
    speakers: ZH,
    paragraphs: ["小明：你好！", "小红：你好吗？"],
    expect: [
      { speaker: "小明", text: "你好！" },
      { speaker: "小红", text: "你好吗？" },
    ],
  },
  {
    // A colon inside the line must not be mistaken for a name prefix.
    name: "chinese, colon mid-sentence",
    speakers: ZH,
    paragraphs: ["小明：他说：我们走吧。"],
    expect: [{ speaker: "小明", text: "他说：我们走吧。" }],
  },
  {
    name: "no prefix at all",
    speakers: ZH,
    paragraphs: ["今天天气很好。"],
    expect: [{ speaker: null, text: "今天天气很好。" }],
  },
];

let failures = 0;

for (const c of CASES) {
  const turns = splitTurns(c.paragraphs, c.speakers);
  let ok = turns.length === c.expect.length;
  for (let i = 0; ok && i < turns.length; i++) {
    ok =
      turns[i]!.speaker === c.expect[i]!.speaker &&
      turns[i]!.text === c.expect[i]!.text;
  }

  // Whatever else, the offsets must index into the string the TTS receives.
  const spoken = spokenText(turns);
  for (const t of turns) {
    if (spoken.slice(t.offset, t.offset + t.text.length) !== t.text) {
      ok = false;
    }
  }

  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${c.name}`);
  if (!ok) {
    for (const t of turns) {
      console.log(`       speaker=${JSON.stringify(t.speaker)} text=${JSON.stringify(t.text)}`);
    }
    console.log(`       spoken: ${JSON.stringify(spoken)}`);
  }
}

// No speaker's name may survive into what is spoken aloud.
for (const c of CASES) {
  const spoken = spokenText(splitTurns(c.paragraphs, c.speakers));
  for (const s of c.speakers) {
    if (c.expect.some((e) => e.text.includes(s.name))) continue;
    if (spoken.includes(s.name)) {
      failures++;
      console.log(`FAIL ${c.name}: "${s.name}" is spoken aloud`);
    }
  }
}

console.log(failures ? `\n${failures} failing` : "\nturns split correctly in every script");
process.exit(failures ? 1 : 0);
