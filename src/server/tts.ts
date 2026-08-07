/**
 * Text-to-speech via ElevenLabs, with the settings carried over from the
 * Read Any Language extension (same models, same voice_settings, same
 * per-request character cap).
 *
 * Two things matter here, and both are about money:
 *
 *  1. THE CACHE IS THE PRODUCT. Speech is ~100% of this app's running cost -
 *     at $0.10 per 1,000 characters, a 400-word story is about 24 cents, while
 *     the text that produced it costs a fraction of a cent. So audio is keyed
 *     by a hash of the exact text plus voice plus model, written to
 *     public/audio/, and served statically forever after. Re-listening is free.
 *
 *  2. NOTHING IS SYNTHESISED SPECULATIVELY. This is only ever called for a
 *     piece that already passed difficulty verification and that the reader
 *     asked to hear. A draft must never reach this file.
 *
 * We use the /with-timestamps endpoint, which costs exactly the same as plain
 * synthesis but also returns per-character timings - enough to highlight the
 * text in sync with the audio.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { getDb } from "./db";
import { AUDIO_DIR } from "./paths";
import { castSpeakers } from "./voices";
import type { Speaker, Turn } from "@/lib/dialogue";

const DEFAULTS = {
  // "Alice - Clear, Engaging Educator". Chosen from the *premade* set, which is
  // the only category a free key may use via the API - library and
  // professional voices return 402 paid_plan_required, including some that used
  // to be premade. Run `npm run voices` to see what a given key can use.
  //
  // No premade voice is a native Spanish speaker, but eleven_multilingual_v2
  // drives the pronunciation, and clarity matters more than character for
  // someone still decoding the words.
  voiceId: "Xb7hH8MSUJpSbSDYk0k2",
  modelId: "eleven_multilingual_v2",
  // The dialogue endpoint's own default, and the only model family that takes
  // multi-voice input. Same $0.10/1k characters as multilingual_v2.
  dialogueModelId: "eleven_v3",
  maxChars: 6_000,
};

// Re-exported so the audio route can import it from here alongside everything
// else it needs; `export ... from` alone would not bind it in this module.
export { AUDIO_DIR };

export interface Alignment {
  characters: string[];
  starts: number[];
  ends: number[];
}

export interface Narration {
  /** Public URL of the mp3. */
  url: string;
  alignment: Alignment | null;
  characters: number;
  /** True when this came from disk and cost nothing. */
  cached: boolean;
}

function config() {
  return {
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: process.env.ELEVENLABS_VOICE_ID || DEFAULTS.voiceId,
    modelId: process.env.ELEVENLABS_MODEL_ID || DEFAULTS.modelId,
    dialogueModelId:
      process.env.ELEVENLABS_DIALOGUE_MODEL_ID || DEFAULTS.dialogueModelId,
    maxChars: Number(process.env.ELEVENLABS_MAX_CHARS) || DEFAULTS.maxChars,
  };
}

export function isTtsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function toAlignment(
  raw:
    | {
        characters: string[];
        character_start_times_seconds: number[];
        character_end_times_seconds: number[];
      }
    | undefined,
): Alignment | null {
  return raw
    ? {
        characters: raw.characters,
        starts: raw.character_start_times_seconds,
        ends: raw.character_end_times_seconds,
      }
    : null;
}

/** The cached clip for this hash, if it has been synthesised before. */
async function readCached(
  hash: string,
): Promise<{ url: string; alignment: Alignment | null } | null> {
  const mp3Path = join(AUDIO_DIR, `${hash}.mp3`);
  if (!(await exists(mp3Path))) return null;

  let alignment: Alignment | null = null;
  const jsonPath = join(AUDIO_DIR, `${hash}.json`);
  if (await exists(jsonPath)) {
    alignment = JSON.parse(await readFile(jsonPath, "utf8")) as Alignment;
  }
  return { url: `/audio/${hash}.mp3`, alignment };
}

/** Write the clip and its timings, and return the public URL. */
async function persist(
  hash: string,
  audioBase64: string,
  alignment: Alignment | null,
): Promise<string> {
  await mkdir(AUDIO_DIR, { recursive: true });
  await writeFile(join(AUDIO_DIR, `${hash}.mp3`), Buffer.from(audioBase64, "base64"));
  if (alignment) {
    await writeFile(join(AUDIO_DIR, `${hash}.json`), JSON.stringify(alignment));
  }
  return `/audio/${hash}.mp3`;
}

/** Log the spend. This table is the only record of what audio has cost. */
function record(
  hash: string,
  pieceId: string,
  voiceId: string,
  modelId: string,
  characters: number,
): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO audio (hash, piece_id, voice_id, model_id, characters, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(hash, pieceId, voiceId, modelId, characters, new Date().toISOString());
}

/**
 * Synthesise `text`, or return the cached file if this exact text has been
 * spoken before in this voice and model.
 */
export async function narrate(text: string, pieceId: string): Promise<Narration> {
  const { apiKey, voiceId, modelId, maxChars } = config();
  if (!apiKey) throw new Error("missing ELEVENLABS_API_KEY");

  if (text.length > maxChars) {
    // A backstop against a surprise bill, mirroring the extension's cap.
    throw new Error(
      `Text is ${text.length} characters, over the ${maxChars} limit for one request.`,
    );
  }

  const hash = createHash("sha256")
    .update(`${modelId}:${voiceId}:${text}`)
    .digest("hex")
    .slice(0, 32);

  const cached = await readCached(hash);
  if (cached) return { ...cached, characters: text.length, cached: true };

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 402) {
      throw new Error(
        `Voice ${voiceId} needs a paid ElevenLabs plan. Run \`npm run voices\` ` +
          `and set ELEVENLABS_VOICE_ID to one listed under "premade".`,
      );
    }
    throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    audio_base64: string;
    alignment?: {
      characters: string[];
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    };
  };

  const alignment = toAlignment(data.alignment);
  const url = await persist(hash, data.audio_base64, alignment);
  record(hash, pieceId, voiceId, modelId, text.length);

  return { url, alignment, characters: text.length, cached: false };
}

/**
 * Speak a conversation with one voice per character.
 *
 * Two things this fixes over feeding the whole thing to `narrate`: the speaker
 * names are never sent, so nobody hears "Alice colon", and each character keeps
 * a distinct, gender-matched voice, which is what makes a dialogue followable
 * at all when you are still decoding the words.
 *
 * ElevenLabs' dialogue endpoint takes the turns in one request and returns one
 * audio file, so this costs the same as single-voice narration - slightly less,
 * in fact, since the names are dropped - and still yields a single character
 * alignment for the reader to highlight against. That alignment indexes into
 * the turns concatenated WITHOUT separators, which is exactly what
 * `spokenText()` produces.
 */
export async function narrateDialogue(
  turns: Turn[],
  speakers: Speaker[],
  pieceId: string,
): Promise<Narration> {
  const { apiKey, maxChars, dialogueModelId } = config();
  if (!apiKey) throw new Error("missing ELEVENLABS_API_KEY");

  const cast = castSpeakers(speakers, pieceId);
  const fallback = config().voiceId;

  const inputs = turns
    .filter((t) => t.text.length > 0)
    .map((t) => ({
      text: t.text,
      voice_id:
        (t.speaker && cast.get(t.speaker.trim().toLowerCase())) || fallback,
    }));

  const characters = inputs.reduce((n, i) => n + i.text.length, 0);
  if (characters > maxChars) {
    throw new Error(
      `Dialogue is ${characters} characters, over the ${maxChars} limit for one request.`,
    );
  }

  const hash = createHash("sha256")
    .update(`${dialogueModelId}:${JSON.stringify(inputs)}`)
    .digest("hex")
    .slice(0, 32);

  const cached = await readCached(hash);
  if (cached) return { ...cached, characters, cached: true };

  const res = await fetch(
    "https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps",
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs, model_id: dialogueModelId }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 402) {
      throw new Error(
        `Multi-voice dialogue needs voices this plan can use. Run \`npm run voices\` ` +
          `and check src/server/voices.ts lists only "premade" ones.`,
      );
    }
    throw new Error(`ElevenLabs dialogue ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    audio_base64: string;
    alignment?: {
      characters: string[];
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    };
  };

  const alignment = toAlignment(data.alignment);
  const url = await persist(hash, data.audio_base64, alignment);

  record(hash, pieceId, [...new Set(inputs.map((i) => i.voice_id))].join("+"), dialogueModelId, characters);

  return { url, alignment, characters, cached: false };
}

/**
 * Every character ever synthesised, across all readers - the actual bill.
 *
 * This is operator information, not learner information. A reader does not care
 * what the site has cost its owner, and showing them a number that goes up when
 * strangers press Listen is worse than useless: for most of this app's life the
 * home page told every visitor that the owner's spend was theirs.
 */
export function charactersSpentTotal(): number {
  const row = getDb()
    .prepare("SELECT COALESCE(SUM(characters), 0) AS total FROM audio")
    .get() as { total: number };
  return row.total;
}
