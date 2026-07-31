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
import { mkdir, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { getDb } from "./db";

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
  maxChars: 6_000,
};

const AUDIO_DIR = join(process.cwd(), "public", "audio");

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

  const mp3Path = join(AUDIO_DIR, `${hash}.mp3`);
  const jsonPath = join(AUDIO_DIR, `${hash}.json`);
  const url = `/audio/${hash}.mp3`;

  if (await exists(mp3Path)) {
    let alignment: Alignment | null = null;
    if (await exists(jsonPath)) {
      const { readFile } = await import("node:fs/promises");
      alignment = JSON.parse(await readFile(jsonPath, "utf8")) as Alignment;
    }
    return { url, alignment, characters: text.length, cached: true };
  }

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

  const alignment: Alignment | null = data.alignment
    ? {
        characters: data.alignment.characters,
        starts: data.alignment.character_start_times_seconds,
        ends: data.alignment.character_end_times_seconds,
      }
    : null;

  await mkdir(AUDIO_DIR, { recursive: true });
  await writeFile(mp3Path, Buffer.from(data.audio_base64, "base64"));
  if (alignment) await writeFile(jsonPath, JSON.stringify(alignment));

  getDb()
    .prepare(
      `INSERT OR REPLACE INTO audio (hash, piece_id, voice_id, model_id, characters, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(hash, pieceId, voiceId, modelId, text.length, new Date().toISOString());

  return { url, alignment, characters: text.length, cached: false };
}

/** Total characters ever synthesised - the running bill, in the UI. */
export function charactersSpent(): number {
  const row = getDb()
    .prepare("SELECT COALESCE(SUM(characters), 0) AS total FROM audio")
    .get() as { total: number };
  return row.total;
}
