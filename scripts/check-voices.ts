/**
 * Assert nobody reads a language they are not a native speaker of.
 *
 *   npx tsx scripts/check-voices.ts
 *
 * Offline: no key, no network, no synthesis. What it guards is a table that
 * rots quietly. Every story and article in all three languages used to be read
 * by Alice, a British-accented English voice, and nothing anywhere said so - it
 * was audible only as a wrong accent in Chinese, which is the kind of fault
 * nobody files a bug for.
 *
 * The ids themselves are checked against the account by `npm run voices`, which
 * needs a key. This file checks the shape: that every language has natives, that
 * casting cannot leak outside them, and that a conversation can be cast at all.
 */
import {
  castSpeakers,
  narrationVoiceFor,
  voiceName,
  NATIVE_BY_LANGUAGE,
  FALLBACK_POOL,
} from "../src/server/voices";
import type { Speaker } from "../src/lib/dialogue";

let failures = 0;

function ok(name: string, condition: boolean, detail = "") {
  if (!condition) failures++;
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

/** The app's own codes, not bare language names - `zh-CN` must find `zh`. */
const LANGUAGES = ["es", "zh-CN", "id"];

delete process.env.ELEVENLABS_VOICE_ID;

// --- every language the app teaches has native voices ---------------------
for (const code of LANGUAGES) {
  const natives = NATIVE_BY_LANGUAGE[code.slice(0, 2).toLowerCase()];
  ok(`${code}: has native voices`, Boolean(natives?.length), `${natives?.length ?? 0}`);
  if (!natives?.length) continue;

  ok(`${code}: no duplicate ids`, new Set(natives.map((v) => v.id)).size === natives.length);
  // Both genders, or every mixed-gender scene borrows on the first speaker.
  const genders = new Set(natives.map((v) => v.gender));
  ok(`${code}: has both genders to cast from`, genders.size === 2, [...genders].join("+"));
  // Enough for a normal cast without wrapping onto a voice already used.
  ok(`${code}: at least two of each gender`, ["female", "male"].every(
    (g) => natives.filter((v) => v.gender === g).length >= 2,
  ));
  // None of the English premades may appear in a native list - that is exactly
  // the bug this file exists to prevent.
  ok(
    `${code}: no English fallback voice smuggled in`,
    !natives.some((v) => FALLBACK_POOL.some((f) => f.id === v.id)),
  );
}

// --- the narrator is a native speaker -------------------------------------
for (const code of LANGUAGES) {
  const natives = NATIVE_BY_LANGUAGE[code.slice(0, 2).toLowerCase()]!;
  const chosen = narrationVoiceFor(code);
  ok(
    `${code}: narrator is a native speaker`,
    natives.some((v) => v.id === chosen),
    `${voiceName(chosen)}`,
  );
}

ok(
  "zh-CN resolves to the same narrator as zh",
  narrationVoiceFor("zh-CN") === narrationVoiceFor("zh"),
);

// A language nobody has recorded still gets a voice rather than an exception.
ok(
  "an unknown language falls back rather than throwing",
  FALLBACK_POOL.some((v) => v.id === narrationVoiceFor("xx")),
  voiceName(narrationVoiceFor("xx")),
);

process.env.ELEVENLABS_VOICE_ID = "some-chosen-voice";
ok("ELEVENLABS_VOICE_ID overrides the table", narrationVoiceFor("zh") === "some-chosen-voice");
delete process.env.ELEVENLABS_VOICE_ID;

// --- casting stays native --------------------------------------------------
const three: Speaker[] = [
  { name: "Ana", gender: "female" },
  { name: "Bo", gender: "male" },
  { name: "Cai", gender: "female" },
];

for (const code of LANGUAGES) {
  const natives = NATIVE_BY_LANGUAGE[code.slice(0, 2).toLowerCase()]!;
  const cast = castSpeakers(three, "seed-piece-id", code);
  ok(`${code}: everyone gets a voice`, cast.size === three.length, `${cast.size}`);
  ok(
    `${code}: every voice is a native speaker`,
    [...cast.values()].every((id) => natives.some((v) => v.id === id)),
    [...cast.values()].map((id) => voiceName(id)).join(", "),
  );
  ok(`${code}: no two speakers share a voice`, new Set(cast.values()).size === cast.size);
  ok(
    `${code}: genders match where the pool allows`,
    [...cast.entries()].every(([name, id]) => {
      const want = three.find((s) => s.name.toLowerCase() === name)!.gender;
      return natives.find((v) => v.id === id)!.gender === want;
    }),
  );
}

// Borrowing across genders must not escape the language: an audible foreign
// accent is worse than a wrongly-gendered speaker.
const manyWomen: Speaker[] = Array.from({ length: 5 }, (_, i) => ({
  name: `W${i}`,
  gender: "female" as const,
}));
const stretched = castSpeakers(manyWomen, "seed", "zh-CN");
ok(
  "running a gender dry borrows within the language, not outside it",
  [...stretched.values()].every((id) =>
    NATIVE_BY_LANGUAGE.zh!.some((v) => v.id === id),
  ),
  [...stretched.values()].map((id) => voiceName(id)).join(", "),
);

// Every id must be nameable, or the dialogue dump prints raw ids.
for (const [code, list] of Object.entries(NATIVE_BY_LANGUAGE)) {
  ok(`${code}: every voice has a name`, list.every((v) => voiceName(v.id) === v.name));
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
