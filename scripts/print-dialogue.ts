/**
 * Show how a stored conversation was split into turns and cast into voices -
 * the two things that decide whether the audio sounds like two people.
 */
import Database from "better-sqlite3";
import { splitTurns, spokenText, type Speaker } from "../src/lib/dialogue";
import { castSpeakers, voiceName } from "../src/server/voices";

const db = new Database("data/fluent.sqlite", { readonly: true });
const id = process.env.PIECE_ID;
const row = (
  id
    ? db.prepare("SELECT * FROM pieces WHERE id = ?").get(id)
    : db.prepare("SELECT * FROM pieces WHERE format = 'conversation' ORDER BY created_at DESC LIMIT 1").get()
) as Record<string, string> | undefined;

if (!row) {
  console.error("no conversation found");
  process.exit(1);
}

const paragraphs = JSON.parse(row.body!) as string[];
const speakers = JSON.parse(row.speakers ?? "[]") as Speaker[];
const turns = splitTurns(paragraphs, speakers);
const cast = castSpeakers(speakers, row.id!);

console.log(`"${row.title}"`);
console.log(`\ndeclared speakers: ${speakers.map((s) => `${s.name} (${s.gender})`).join(", ") || "NONE"}`);
console.log("cast:");
for (const [name, voiceId] of cast) {
  console.log(`  ${name.padEnd(12)} -> ${voiceName(voiceId) ?? voiceId}`);
}

console.log(`\nturns (${turns.length}), showing what is actually SPOKEN:`);
for (const t of turns.slice(0, 6)) {
  const speakerLabel = t.speaker ?? "(unattributed)";
  console.log(`  @${String(t.offset).padStart(4)} [${speakerLabel.padEnd(10)}] ${t.text.slice(0, 62)}`);
}

const spoken = spokenText(turns);
const displayed = paragraphs.join("");
console.log(`\nspoken ${spoken.length} chars vs displayed ${displayed.length} - names dropped: ${displayed.length - spoken.length}`);
const unattributed = turns.filter((t) => !t.speaker).length;
console.log(unattributed ? `WARNING: ${unattributed} turn(s) had no recognised speaker` : "every turn attributed");
