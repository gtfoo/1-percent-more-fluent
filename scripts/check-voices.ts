/**
 * Assert nobody reads a language ElevenLabs has never verified them in.
 *
 *   npx tsx scripts/check-voices.ts
 *
 * Offline: no key, no network, no synthesis. What it guards is a table that
 * rots quietly. Before this, every story and article in all three languages was
 * read by Alice - a British-accented English educator voice verified in none of
 * them - and nothing anywhere said so. It was audible only as a slightly wrong
 * accent in Chinese, which is exactly the kind of fault nobody files a bug for.
 *
 * To refresh the underlying data against the account, run `npm run voices`.
 */
import {
  castSpeakers,
  narrationVoiceFor,
  voiceName,
  VOICE_POOL,
  VERIFIED_BY_LANGUAGE,
} from "../src/server/voices";
import type { Speaker } from "../src/lib/dialogue";

let failures = 0;

function ok(name: string, condition: boolean, detail = "") {
  if (!condition) failures++;
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

// The app's own codes, not bare language names: `zh-CN` has to find the Chinese
// list, or every Chinese piece silently falls back to the unverified pool.
const LANGUAGES = ["es", "zh-CN", "id"];

// --- the tables are internally consistent ---------------------------------
for (const [code, ids] of Object.entries(VERIFIED_BY_LANGUAGE)) {
  for (const id of ids) {
    ok(
      `${code}: ${id} is a voice we actually have`,
      VOICE_POOL.some((v) => v.id === id),
      voiceName(id) ?? "NOT IN POOL",
    );
  }
  ok(`${code}: no duplicates`, new Set(ids).size === ids.length);
  const genders = new Set(
    ids.map((id) => VOICE_POOL.find((v) => v.id === id)!.gender),
  );
  // A conversation needs both, or every mixed-gender scene borrows immediately.
  ok(`${code}: has both genders to cast from`, genders.size === 2, [...genders].join("+"));
}

// --- narration picks a verified voice where one exists --------------------
delete process.env.ELEVENLABS_VOICE_ID;
for (const code of LANGUAGES) {
  const chosen = narrationVoiceFor(code);
  const verified = VERIFIED_BY_LANGUAGE[code.slice(0, 2).toLowerCase()];
  if (verified?.length) {
    ok(
      `${code}: narrator is verified in the language`,
      verified.includes(chosen),
      `${voiceName(chosen)}`,
    );
  } else {
    // Indonesian. Honest rather than silent: there is no verified premade voice,
    // so it lands in the general pool, and the assertion records that we know.
    ok(
      `${code}: no verified voice exists, falls back to the pool`,
      VOICE_POOL.some((v) => v.id === chosen),
      `${voiceName(chosen)} - unverified, see voices.ts`,
    );
  }
}

// The locale suffix must not defeat the lookup.
ok(
  "zh-CN resolves to the same narrator as zh",
  narrationVoiceFor("zh-CN") === narrationVoiceFor("zh"),
);

// An operator's explicit choice still wins over the table.
process.env.ELEVENLABS_VOICE_ID = "some-chosen-voice";
ok("ELEVENLABS_VOICE_ID overrides the table", narrationVoiceFor("zh") === "some-chosen-voice");
delete process.env.ELEVENLABS_VOICE_ID;

// --- casting stays inside the verified set --------------------------------
const cast3: Speaker[] = [
  { name: "Ana", gender: "female" },
  { name: "Bo", gender: "male" },
  { name: "Cai", gender: "female" },
];

for (const code of ["zh-CN", "es"]) {
  const cast = castSpeakers(cast3, "seed-piece-id", code);
  const verified = VERIFIED_BY_LANGUAGE[code.slice(0, 2)]!;
  ok(`${code}: everyone gets a voice`, cast.size === cast3.length, `${cast.size}`);
  ok(
    `${code}: every voice is verified in the language`,
    [...cast.values()].every((id) => verified.includes(id)),
    [...cast.values()].map((id) => voiceName(id)).join(", "),
  );
  ok(
    `${code}: no two speakers share a voice`,
    new Set(cast.values()).size === cast.size,
  );
}

// Borrowing across genders must not escape the language, because an audible
// mispronunciation is worse than a wrongly-gendered voice.
const manyWomen: Speaker[] = Array.from({ length: 6 }, (_, i) => ({
  name: `W${i}`,
  gender: "female" as const,
}));
const stretched = castSpeakers(manyWomen, "seed", "zh-CN");
ok(
  "running a gender dry borrows within the language, not outside it",
  [...stretched.values()].every((id) => VERIFIED_BY_LANGUAGE.zh!.includes(id)),
  [...stretched.values()].map((id) => voiceName(id)).join(", "),
);

// Indonesian has no verified list, so it must still cast rather than fail.
const idCast = castSpeakers(cast3, "seed", "id");
ok("a language with no verified voices still casts", idCast.size === cast3.length);

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
