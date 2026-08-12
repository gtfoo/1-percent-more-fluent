/**
 * Casting a conversation, and choosing who reads a narration.
 *
 * Only ElevenLabs' *premade* voices are usable on a free key - library and
 * professional voices return 402 paid_plan_required, including some that used
 * to be premade. Run `npm run voices` to check what a given key can actually
 * use before changing this list.
 *
 * None of these are native speakers of anything but English; the multilingual
 * model drives the pronunciation. What the lists below encode is narrower and
 * more useful than nativeness: ElevenLabs publishes, per voice, the languages
 * it has actually been VERIFIED in, and the app was ignoring it.
 *
 * That is not academic. Every story and article in every language was read by
 * Alice, a British-accented English educator voice verified in NONE of the
 * three languages this app teaches - which is audible in Chinese as an English
 * speaker doing their best with Mandarin, mostly clear with some words wrong.
 *
 * Taken from `GET /v1/voices` → `verified_languages`, filtered to entries whose
 * `model_id` is the model this app narrates with. Verification is per model, and
 * only `eleven_multilingual_v2` and `eleven_turbo_v2_5` carry any: `eleven_v3`,
 * which the dialogue endpoint uses, publishes none at all. So these lists are
 * evidence for narration and an educated guess for dialogue.
 */
import type { Speaker } from "@/lib/dialogue";

interface PremadeVoice {
  id: string;
  name: string;
  gender: "female" | "male";
}

/**
 * Every premade voice on a free key, regardless of language.
 *
 * Still here because it is the fallback for a language ElevenLabs has verified
 * nobody in - Indonesian today - where an unverified voice is the only option
 * there is.
 */
const POOL: PremadeVoice[] = [
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", gender: "female" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", gender: "female" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", gender: "female" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", gender: "female" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", gender: "female" },
  { id: "hpp4J3VqNfWAUOO0d1Us", name: "Bella", gender: "female" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", gender: "female" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "male" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", gender: "male" },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric", gender: "male" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", gender: "male" },
  { id: "iP95p4xoKVk53GoZ742B", name: "Chris", gender: "male" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", gender: "male" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", gender: "male" },
  { id: "bIHbv24MWmeRgasZH58o", name: "Will", gender: "male" },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill", gender: "male" },
];

const byId = (id: string): PremadeVoice => POOL.find((v) => v.id === id)!;

/**
 * Voices ElevenLabs has verified in each language, best first.
 *
 * Keyed by the language-code PREFIX, so `zh-CN` and any future `zh-TW` both
 * find the Chinese list without this file having to know every locale the app
 * might add.
 *
 * `River` is verified for Chinese and deliberately absent: its published gender
 * is "neutral", and casting reads gender to keep two characters distinguishable.
 * A voice that cannot answer that question is more use as a narrator than in a
 * scene, and narration here does not need a third option.
 */
const VERIFIED: Record<string, string[]> = {
  // 9 premade voices verified; these are the 8 with a stated gender.
  zh: [
    "EXAVITQu4vr4xnSDxMaL", // Sarah
    "pFZP5JQG7iQjIQuC4Bku", // Lily
    "cgSgspJ2msm6clMCkdW9", // Jessica
    "FGY2WhTYpPnrIDTdsKH5", // Laura
    "nPczCjzI2devNBz1zQrb", // Brian
    "IKne3meq5aSn9XLyUdCD", // Charlie
    "bIHbv24MWmeRgasZH58o", // Will
    "pqHfZKP75CvOlQylNhV4", // Bill
  ],
  es: [
    "EXAVITQu4vr4xnSDxMaL", // Sarah
    "XrExE9yKIg1WjnnlVkGX", // Matilda
    "JBFqnCBsd6RMkjVDRZzb", // George
    "CwhRBWXzGAHq8TQ4Fs17", // Roger
    "cjVigY5qzO86Huf0OWal", // Eric
    "IKne3meq5aSn9XLyUdCD", // Charlie
    "bIHbv24MWmeRgasZH58o", // Will
  ],
  // Indonesian: ElevenLabs has verified NO premade voice in it. The one
  // Indonesian voice on the account, "Andi (Indonesian)", is a professional
  // voice, which is the category a free key cannot use. Deliberately absent
  // rather than listed-and-broken: an empty entry falls through to POOL below,
  // which is exactly what happened before this file knew about languages.
};

/** The pool to cast a piece from, narrowed to voices verified in its language. */
function poolFor(languageCode: string): PremadeVoice[] {
  const ids = VERIFIED[languageCode.slice(0, 2).toLowerCase()];
  return ids?.length ? ids.map(byId) : POOL;
}

/**
 * Who reads a narration, for this language.
 *
 * `ELEVENLABS_VOICE_ID` still wins, because an operator who has picked a voice
 * has more context than this table. Without it, the first verified voice for the
 * language - and only if the language has none does this land back on Alice,
 * which is the old behaviour and the reason for the change.
 */
export function narrationVoiceFor(languageCode: string): string {
  const override = process.env.ELEVENLABS_VOICE_ID;
  if (override) return override;
  return poolFor(languageCode)[0]?.id ?? "Xb7hH8MSUJpSbSDYk0k2";
}

/** Stable per-piece variation, so two conversations do not sound identical. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Assign each speaker a distinct, gender-matched voice from that language's
 * verified pool.
 *
 * Distinctness matters more than the gender match: two characters sharing a
 * voice makes a conversation impossible to follow, which is the whole problem
 * this solves. So if a gender pool runs dry, we borrow from the other rather
 * than reuse - better a wrongly-gendered voice than an ambiguous scene.
 *
 * The language pool is narrowed FIRST, so borrowing happens inside the verified
 * set rather than reaching for an unverified voice. A wrongly-gendered voice
 * that pronounces the language is a better trade than a right-gendered one that
 * does not.
 */
export function castSpeakers(
  speakers: Speaker[],
  seed: string,
  languageCode: string,
): Map<string, string> {
  const pool = poolFor(languageCode);
  const offset = hash(seed);
  const taken = new Set<string>();
  const cast = new Map<string, string>();

  const pick = (gender: "female" | "male"): PremadeVoice | undefined => {
    const matching = pool.filter((v) => v.gender === gender && !taken.has(v.id));
    const usable = matching.length ? matching : pool.filter((v) => !taken.has(v.id));
    if (!usable.length) return undefined;
    return usable[(offset + taken.size) % usable.length];
  };

  for (const speaker of speakers) {
    const voice = pick(speaker.gender);
    if (!voice) continue;
    taken.add(voice.id);
    cast.set(speaker.name.trim().toLowerCase(), voice.id);
  }

  return cast;
}

export function voiceName(id: string): string | undefined {
  return POOL.find((v) => v.id === id)?.name;
}

/** Exposed for scripts/check-voices.ts. */
export const VOICE_POOL = POOL;
export const VERIFIED_BY_LANGUAGE = VERIFIED;
