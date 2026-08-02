/**
 * Does the TTS alignment actually index into the text we sent?
 *
 *   npx tsx scripts/check-alignment.ts
 *
 * The reader highlights by treating `alignment.characters[i]` as the i-th
 * character of the string sent for synthesis. That is an assumption about what
 * ElevenLabs returns, and nothing verified it. If the provider normalises the
 * text at all - expanding a number, dropping punctuation, splitting a character
 * into several entries - every offset after that point is wrong, and the
 * highlight drifts further from the audio the longer the piece runs.
 *
 * This compares the two strings for every cached alignment and reports the
 * first divergence.
 */
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { splitTurns } from "../src/lib/dialogue";
import { getLanguage } from "../src/lib/languages";

/** Seconds of audio, or null if ffprobe is not installed. */
function mp3Duration(path: string): number | null {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
      { encoding: "utf8" },
    );
    const n = Number.parseFloat(out.trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

const db = new Database("data/fluent.sqlite", { readonly: true });

const rows = db
  .prepare(
    `SELECT a.hash, p.language, p.format, p.body, p.speakers
       FROM audio a JOIN pieces p ON p.id = a.piece_id`,
  )
  .all() as {
  hash: string;
  language: string;
  format: string;
  body: string;
  speakers: string | null;
}[];

if (!rows.length) {
  console.log("no cached audio to check");
  process.exit(0);
}

let failures = 0;

for (const row of rows) {
  const paragraphs = JSON.parse(row.body) as string[];
  const speakers = row.speakers ? (JSON.parse(row.speakers) as unknown[]) : [];

  // Reconstruct exactly what the TTS route sent, per format. These two must
  // stay in step with src/app/api/tts/route.ts.
  const sent =
    row.format === "conversation"
      ? splitTurns(paragraphs, speakers as never)
          .map((t) => t.text)
          .join("")
      : paragraphs.join("\n\n");

  let alignment: { characters: string[]; ends: number[] };
  try {
    alignment = JSON.parse(
      readFileSync(join("data/audio", `${row.hash}.json`), "utf8"),
    );
  } catch {
    console.log(`skip ${row.hash.slice(0, 8)} (${row.language}/${row.format}): no alignment file`);
    continue;
  }

  const got = alignment.characters.join("");
  const ok = got === sent;
  if (!ok) failures++;

  console.log(
    `${ok ? "ok  " : "FAIL"} ${row.hash.slice(0, 8)}  ${row.language.padEnd(5)} ${row.format.padEnd(12)} ` +
      `sent ${String(sent.length).padStart(5)} chars, alignment ${String(got.length).padStart(5)} ` +
      `(${alignment.characters.length} entries, ${alignment.ends.length} times)`,
  );

  if (!ok) {
    // Where do they first diverge, and what did the provider do there?
    let i = 0;
    while (i < Math.min(sent.length, got.length) && sent[i] === got[i]) i++;
    const show = (s: string, from: number) =>
      JSON.stringify(s.slice(Math.max(0, from - 20), from + 30));
    console.log(`       first divergence at char ${i}`);
    console.log(`         sent      ...${show(sent, i)}`);
    console.log(`         alignment ...${show(got, i)}`);
  }

  // Entries and timings must correspond one-to-one whatever else is true.
  if (alignment.characters.length !== alignment.ends.length) {
    console.log(`       characters/ends length mismatch`);
    failures++;
  }

  // A multi-character entry breaks the reader's index arithmetic even when the
  // joined strings happen to match.
  const wide = alignment.characters.findIndex((c) => c.length !== 1);
  if (wide >= 0) {
    console.log(
      `       entry ${wide} is ${JSON.stringify(alignment.characters[wide])} ` +
        `(${alignment.characters[wide]!.length} code units, not 1)`,
    );
    failures++;
  }

  // Correct characters are not enough: the timings have to describe the audio
  // that actually plays. If the alignment's timeline is shorter or longer than
  // the mp3, the highlight runs ahead of or behind the voice by a margin that
  // grows through the piece - which is exactly what "it doesn't match" looks
  // like even when every offset is right.
  const ends = alignment.ends;
  const last = ends[ends.length - 1] ?? 0;
  const duration = mp3Duration(join("data/audio", `${row.hash}.mp3`));

  const nonMonotonic = ends.findIndex((v, i) => i > 0 && v < ends[i - 1]!);
  if (nonMonotonic > 0) {
    console.log(`       ends go backwards at entry ${nonMonotonic}`);
    failures++;
  }

  if (duration === null) {
    console.log(`       (no ffprobe; cannot compare timeline to audio)`);
  } else {
    const drift = duration - last;
    const bad = Math.abs(drift) > 0.75;
    if (bad) failures++;
    console.log(
      `     ${bad ? "FAIL" : "ok  "} timeline: alignment ends ${last.toFixed(2)}s, ` +
        `audio is ${duration.toFixed(2)}s (drift ${drift >= 0 ? "+" : ""}${drift.toFixed(2)}s)`,
    );
  }
}

// --- The reader's own offset arithmetic -------------------------------------
// The alignment being correct is only half of it. The reader highlights a token
// when the spoken character index falls inside [token.at, token.at + length),
// and it builds `at` by walking `language.tokenize()` and summing token
// lengths. That is only valid if tokenize() reproduces the text exactly - if it
// drops or rewrites so much as one character, every offset after that point
// slides, and the highlight drifts away from the voice.
//
// Runs over every piece, audio or not: the arithmetic is what is being checked.
console.log("\n--- reader token offsets ---");

const pieces = db
  .prepare(`SELECT id, language, format, body, speakers FROM pieces`)
  .all() as {
  id: string;
  language: string;
  format: string;
  body: string;
  speakers: string | null;
}[];

const byLanguage = new Map<string, { checked: number; bad: number; note: string }>();

for (const piece of pieces) {
  const paragraphs = JSON.parse(piece.body) as string[];
  const speakers = piece.speakers ? (JSON.parse(piece.speakers) as unknown[]) : [];
  const language = getLanguage(piece.language);
  const isConversation = piece.format === "conversation";

  const sent = isConversation
    ? splitTurns(paragraphs, speakers as never)
        .map((t) => t.text)
        .join("")
    : paragraphs.join("\n\n");

  // Rebuild exactly what Reader.tsx builds.
  const placed: { text: string; at: number }[] = [];
  if (isConversation) {
    for (const turn of splitTurns(paragraphs, speakers as never)) {
      let local = 0;
      for (const token of language.tokenize(turn.text)) {
        placed.push({ text: token.text, at: turn.offset + local });
        local += token.text.length;
      }
    }
  } else {
    let base = 0;
    for (const text of paragraphs) {
      let local = 0;
      for (const token of language.tokenize(text)) {
        placed.push({ text: token.text, at: base + local });
        local += token.text.length;
      }
      base += text.length + "\n\n".length;
    }
  }

  const stat = byLanguage.get(piece.language) ?? { checked: 0, bad: 0, note: "" };
  stat.checked++;

  const wrong = placed.find(
    (t) => sent.slice(t.at, t.at + t.text.length) !== t.text,
  );
  if (wrong) {
    stat.bad++;
    failures++;
    if (!stat.note) {
      stat.note =
        `token ${JSON.stringify(wrong.text)} claims offset ${wrong.at}, ` +
        `but the text there is ${JSON.stringify(sent.slice(wrong.at, wrong.at + wrong.text.length))}`;
    }
  }
  byLanguage.set(piece.language, stat);
}

for (const [code, stat] of byLanguage) {
  const ok = stat.bad === 0;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${code.padEnd(6)} ${stat.checked} piece(s), ${stat.bad} with drifting offsets`,
  );
  if (stat.note) console.log(`       ${stat.note}`);
}

console.log(
  failures ? `\n${failures} problem(s)` : "\nalignments and reader offsets agree",
);
process.exit(failures ? 1 : 0);
