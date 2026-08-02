/**
 * Casting a conversation.
 *
 * Only ElevenLabs' *premade* voices are usable on a free key - library and
 * professional voices return 402 paid_plan_required, including some that used
 * to be premade. Run `npm run voices` to check what a given key can actually
 * use before changing this list.
 *
 * None of these are native speakers of anything but English; the multilingual
 * model drives the pronunciation. Gender is what matters for casting, and it
 * comes from the voice's own labels rather than from anything we infer.
 */
import type { Speaker } from "@/lib/dialogue";

interface PremadeVoice {
  id: string;
  name: string;
  gender: "female" | "male";
}

/** Verified present on a free key via /v1/voices, category "premade". */
const POOL: PremadeVoice[] = [
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", gender: "female" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", gender: "female" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", gender: "female" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", gender: "female" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", gender: "female" },
  { id: "hpp4J3VqNfWAUOO0d1Us", name: "Bella", gender: "female" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "male" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", gender: "male" },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric", gender: "male" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", gender: "male" },
  { id: "iP95p4xoKVk53GoZ742B", name: "Chris", gender: "male" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", gender: "male" },
];

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
 * Assign each speaker a distinct, gender-matched voice.
 *
 * Distinctness matters more than the gender match: two characters sharing a
 * voice makes a conversation impossible to follow, which is the whole problem
 * this solves. So if a gender pool runs dry, we borrow from the other rather
 * than reuse - better a wrongly-gendered voice than an ambiguous scene.
 */
export function castSpeakers(
  speakers: Speaker[],
  seed: string,
): Map<string, string> {
  const offset = hash(seed);
  const taken = new Set<string>();
  const cast = new Map<string, string>();

  const pick = (gender: "female" | "male"): PremadeVoice | undefined => {
    const matching = POOL.filter((v) => v.gender === gender && !taken.has(v.id));
    const pool = matching.length
      ? matching
      : POOL.filter((v) => !taken.has(v.id));
    if (!pool.length) return undefined;
    return pool[(offset + taken.size) % pool.length];
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
