/**
 * Who reads a piece, and who plays each part in a conversation.
 *
 * THE VOICES ARE NATIVE SPEAKERS OF THE LANGUAGE. That sounds obvious and was
 * not true here until now: every story and article, in all three languages, was
 * read by Alice - a British-accented English voice - because the pool was built
 * from ElevenLabs' *premade* set, which is entirely English. In Chinese it
 * sounded like an English speaker doing their best with Mandarin.
 *
 * Two corrections got us here, and the second undid an assumption in the first:
 *
 *  1. ElevenLabs publishes `verified_languages` per voice, and the app ignored
 *     it. Choosing a premade voice verified in the language fixed some
 *     mispronunciation - but verification only means the voice was TESTED in
 *     that language, not that it is native to it, so the accent stayed.
 *
 *  2. The pool was restricted to premade voices because library and
 *     professional ones "return 402 paid_plan_required". That was observed on a
 *     free key. THIS ACCOUNT IS PAY-AS-YOU-GO, and the whole voice library is
 *     available to it - including hundreds of native speakers. Every id below
 *     was confirmed to synthesise on this key, on the narration endpoint and,
 *     for a pair of them, on the multi-voice dialogue endpoint.
 *
 * So the accent labels here are real: "beijing mandarin" is a Beijing speaker.
 * Run `npm run voices` before changing anything - a library voice belongs to
 * whoever published it and can be withdrawn, which is why the English pool
 * survives below as a last resort.
 */
import type { Speaker } from "@/lib/dialogue";

interface Voice {
  id: string;
  name: string;
  gender: "female" | "male";
}

/**
 * Native speakers, per language, narrator first.
 *
 * Keyed by language-code PREFIX, so `zh-CN` and any future `zh-TW` both find
 * the Chinese list without this file knowing every locale the app might add.
 *
 * Ordering is deliberate: the first entry narrates, so it is the calmest and
 * clearest of each set, and the rest alternate gender so a cast of two or three
 * gets distinguishable voices before the picker has to wrap.
 *
 * Accents chosen to match who the app teaches: mainland Mandarin for Simplified
 * Chinese rather than Taiwanese or Cantonese, and neutral Latin American Spanish
 * ahead of peninsular, as the more widely understood starting point.
 */
const NATIVE: Record<string, Voice[]> = {
  // Every one of these was listened to on a REAL 70-second piece before being
  // added. That is not ceremony: the voice this list replaced sounded fine on a
  // three-sentence sample - better than the alternatives, on that sample - and
  // fell apart over a full article. A short audition proves nothing here.
  zh: [
    { id: "BqljjWyTnrioXPCNkCd4", name: "Stella Gu", gender: "female" }, // beijing, professional clone
    { id: "DowyQ68vDpgFYdWVGjc3", name: "Jason Chen", gender: "male" }, // beijing
    { id: "JZLpE3AGwpKYZI2X65hN", name: "Mingyao Ye", gender: "female" }, // beijing
    { id: "W8lBaQb9YIoddhxfQNLP", name: "Siqi Liu", gender: "male" }, // beijing
    { id: "APSIkVZudNbPAwyPoeVO", name: "Sage", gender: "female" }, // standard
    // Singapore Mandarin, and the most-used Chinese voice on the platform. Last
    // so it colours a conversation rather than narrating every article in an
    // accent the app is not teaching.
    { id: "hZTuv9Zqrq4yHYrEmF1r", name: "Adam Li", gender: "male" }, // singapore
  ],
  es: [
    { id: "pXGCH52cHhcAprI7uhY9", name: "Maria", gender: "female" }, // latin american
    { id: "KV8mzxnpQFd2ysFwOirJ", name: "Edgardo", gender: "male" }, // latin american
    { id: "irla3teuChAApguKnzms", name: "Diana", gender: "female" }, // colombian
    { id: "1npscUJu0UbVeHp4b0zt", name: "Juan Gabriel", gender: "male" }, // peninsular
    { id: "dX2UjlDzOz7RY8kmMXZo", name: "Matilda Paz", gender: "female" }, // peninsular
    { id: "Wb1wmVQjMx9g2QSIOTPI", name: "Juan Esteban", gender: "male" }, // colombian
  ],
  id: [
    { id: "wvv6DzcHyOVTDgDY7SMW", name: "Andi", gender: "male" }, // standard
    { id: "d15jrIAARvF899pDoC6T", name: "Kak Ceria", gender: "female" }, // standard
    { id: "5YVVTVlHuEcIu0JBLbEF", name: "Ongky", gender: "male" }, // standard
    { id: "BfwyZzLnL4udYd1qYpiN", name: "Luna", gender: "female" }, // standard
    { id: "GmkWJneRwj7Dm7KM5NPf", name: "BonaErwin", gender: "male" }, // standard
    { id: "TrU3igk19A4aIUi2GAA2", name: "Velora", gender: "female" }, // standard
  ],
};

/**
 * ElevenLabs' premade voices - all English natives.
 *
 * No longer what anything is read in. Kept as the floor: a library voice
 * belongs to whoever published it and can be withdrawn, and an English voice
 * reading Mandarin is bad where silence is worse.
 */
const FALLBACK: Voice[] = [
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", gender: "female" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", gender: "female" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", gender: "female" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", gender: "female" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", gender: "female" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", gender: "female" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "male" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", gender: "male" },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric", gender: "male" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", gender: "male" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", gender: "male" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", gender: "male" },
];

/** The voices a piece in this language may be read by, best first. */
function poolFor(languageCode: string): Voice[] {
  return NATIVE[languageCode.slice(0, 2).toLowerCase()] ?? FALLBACK;
}

/**
 * Who reads a narration, for this language.
 *
 * `ELEVENLABS_VOICE_ID` still wins, because an operator who has picked a voice
 * has more context than this table - but note it applies to EVERY language, so
 * setting it puts one voice back in charge of all of them, which is the thing
 * this file exists to undo.
 */
export function narrationVoiceFor(languageCode: string): string {
  return process.env.ELEVENLABS_VOICE_ID || poolFor(languageCode)[0]!.id;
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
 * Assign each speaker a distinct, gender-matched native voice.
 *
 * Distinctness matters more than the gender match: two characters sharing a
 * voice makes a conversation impossible to follow, which is the whole problem
 * this solves. So if a gender pool runs dry, we borrow from the other rather
 * than reuse - better a wrongly-gendered voice than an ambiguous scene.
 *
 * The language pool is narrowed FIRST, so borrowing stays among native
 * speakers rather than reaching for an English voice. A wrongly-gendered
 * speaker of the language beats a right-gendered foreigner.
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

  const pick = (gender: "female" | "male"): Voice | undefined => {
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
  for (const list of [...Object.values(NATIVE), FALLBACK]) {
    const hit = list.find((v) => v.id === id);
    if (hit) return hit.name;
  }
  return undefined;
}

/** Exposed for scripts/check-voices.ts. */
export const NATIVE_BY_LANGUAGE = NATIVE;
export const FALLBACK_POOL = FALLBACK;
