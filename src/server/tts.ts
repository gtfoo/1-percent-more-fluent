/**
 * Text-to-speech via ElevenLabs.
 *
 * Each voice is driven by the settings ITS OWN PUBLISHER recommends, fetched
 * per voice. The models and the per-request character cap are still the ones
 * carried over from the Read Any Language extension; the settings are not, and
 * see SETTINGS_VERSION for why that mattered.
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
import { castSpeakers, narrationVoiceFor } from "./voices";
import { splitTurns, type Speaker, type Turn } from "@/lib/dialogue";

const DEFAULTS = {
  // Only a fallback now: who reads what is decided per language in voices.ts,
  // by native speakers. This is what an unknown language lands on.
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

/**
 * Bump when the settings policy below changes.
 *
 * The settings are part of the cache key, because they change the audio: a clip
 * made under the old policy is not the clip this code would make now, and
 * without this it would be served forever with no way to reach it. That is
 * exactly what happened - the first native-voice clips were synthesised with
 * the wrong settings and would have stayed noisy in the cache permanently.
 *
 * It costs one re-synthesis per clip somebody actually replays, and nothing for
 * the rest.
 */
const SETTINGS_VERSION = "s2";

/** ElevenLabs' documented defaults, for when a voice will not tell us its own. */
const FALLBACK_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  use_speaker_boost: true,
  style: 0,
  speed: 1,
};

type VoiceSettings = typeof FALLBACK_SETTINGS;

/** One lookup per voice per process; these are static, published data. */
const settingsCache = new Map<string, VoiceSettings>();

/**
 * The settings a voice's own publisher recommends for it.
 *
 * We used to send `{stability: 0.5, similarity_boost: 0.75}` to every voice,
 * hardcoded, and nothing else. Two things were wrong with that once the voices
 * stopped being English premades:
 *
 *  - `use_speaker_boost` was never sent. It defaults to true, and governs
 *    presence and level - which is audible as a voice that is softer than it
 *    should be and tails off at the end of a piece.
 *  - The numbers were tuned for premade voices. Library voices are cloned from
 *    real recordings and each publisher tunes their own: one Chinese voice here
 *    asks for stability 0.99 and similarity 0.96, against the 0.5/0.75 we forced
 *    on it. On a cloned voice, the wrong similarity is also what drags source
 *    recording artifacts into the output - the background hiss.
 *
 * A failed lookup is not worth failing a synthesis over, so it falls back to
 * ElevenLabs' documented defaults, which is still better than what we sent
 * before: it at least includes the speaker boost.
 */
async function settingsFor(voiceId: string): Promise<VoiceSettings> {
  const cached = settingsCache.get(voiceId);
  if (cached) return cached;

  const { apiKey } = config();
  let settings = FALLBACK_SETTINGS;
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/voices/${voiceId}/settings`,
      { headers: { "xi-api-key": apiKey ?? "" } },
    );
    if (res.ok) {
      settings = { ...FALLBACK_SETTINGS, ...((await res.json()) as Partial<VoiceSettings>) };
    } else {
      console.warn(`tts: no published settings for voice ${voiceId} (${res.status})`);
    }
  } catch (err) {
    console.warn(`tts: could not read settings for voice ${voiceId}`, err);
  }
  settingsCache.set(voiceId, settings);
  return settings;
}

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
 * What a piece actually says aloud, and how.
 *
 * Three callers need this and all three must agree: the stream route, the
 * alignment route, and the hash they look the clip up by. Derived once here so
 * a conversation cannot be hashed as a narration by one of them - which would
 * not fail, it would quietly synthesise and bill a second copy.
 */
export function spokenTextFor(piece: {
  id: string;
  format: string;
  language: string;
  paragraphs: string[];
  speakers: Speaker[];
}):
  | { mode: "narration"; text: string }
  | { mode: "dialogue"; turns: Turn[]; inputs: { text: string; voice_id: string }[] } {
  if (piece.format !== "conversation") {
    // Must match exactly what the reader renders, or the timings will not line
    // up with the words on screen.
    return { mode: "narration", text: piece.paragraphs.join("\n\n") };
  }
  const turns = splitTurns(piece.paragraphs, piece.speakers);
  return {
    mode: "dialogue",
    turns,
    inputs: dialogueInputs(turns, piece.speakers, piece.id, piece.language),
  };
}

/**
 * Cast the turns and drop the empty ones - the exact payload the dialogue
 * endpoints take.
 *
 * Shared by the streaming and non-streaming paths because it is also what the
 * cache hash is computed over: two copies that drifted would hash differently
 * and silently re-bill an already-synthesised conversation.
 */
function dialogueInputs(
  turns: Turn[],
  speakers: Speaker[],
  pieceId: string,
  languageCode: string,
): { text: string; voice_id: string }[] {
  const cast = castSpeakers(speakers, pieceId, languageCode);
  const fallback = narrationVoiceFor(languageCode);
  return turns
    .filter((t) => t.text.length > 0)
    .map((t) => ({
      text: t.text,
      voice_id: (t.speaker && cast.get(t.speaker.trim().toLowerCase())) || fallback,
    }));
}

/** What the streaming endpoints emit, one JSON object per chunk. */
interface StreamChunk {
  audio_base64: string;
  alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
}

/**
 * The hash a piece's narration is stored under, without synthesising anything.
 *
 * Exported so the alignment endpoint can find the file the stream is writing.
 * It must agree with what narrate/narrateDialogue compute, which is why the
 * two hashing expressions below are the only copies in the file.
 */
export function narrationHash(text: string, languageCode: string): string {
  const { modelId } = config();
  return createHash("sha256")
    .update(`${modelId}:${narrationVoiceFor(languageCode)}:${SETTINGS_VERSION}:${text}`)
    .digest("hex")
    .slice(0, 32);
}

export function dialogueHash(inputs: { text: string; voice_id: string }[]): string {
  const { dialogueModelId } = config();
  return createHash("sha256")
    .update(`${dialogueModelId}:${JSON.stringify(inputs)}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Clips being synthesised right now, by hash.
 *
 * `clipExists` answers one question - is there a finished clip? - and there are
 * three states, not two. The third is "somebody is paying for this exact clip at
 * this exact moment", and without it a second request finds no file and starts
 * its own synthesis. Two taps on Listen, or a reader who reloads while waiting,
 * and the same audio is bought twice. That is not hypothetical: it is how the
 * first live test of this route managed to buy four clips while asking for two.
 *
 * Per-process, which is enough here - one Node process serves this app - but it
 * would need a lock somewhere shared if that ever became several workers.
 */
const inFlight = new Map<string, Promise<void>>();

/**
 * Claim the slot for `hash`. Returns the release, which MUST run on every exit
 * path: a slot that is never released blocks that clip from being synthesised
 * again for the life of the process.
 *
 * Exported for scripts/check-tts-pipe.ts, which pairs it with pipeChunks the
 * same way the two stream functions do.
 */
export function beginSynthesis(hash: string): () => void {
  let release!: () => void;
  inFlight.set(
    hash,
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  return () => {
    inFlight.delete(hash);
    release();
  };
}

/**
 * If this clip is already being synthesised, a promise that settles when that
 * attempt finishes - successfully or not. Await it rather than starting a
 * second one, then look for the file again.
 */
export function synthesisInFlight(hash: string): Promise<void> | null {
  return inFlight.get(hash) ?? null;
}

/**
 * Wait for an in-progress synthesis of this clip, then hand back whatever it
 * left in the cache. Null means nobody was working on it, or their attempt
 * failed - either way the caller should synthesise it themselves.
 */
async function cachedAfterInFlight(
  hash: string,
): Promise<{ url: string; alignment: Alignment | null } | null> {
  const pending = synthesisInFlight(hash);
  if (!pending) return null;
  await pending;
  return readCached(hash);
}

/** The alignment written beside a clip, if synthesis has finished. */
export async function readAlignment(hash: string): Promise<Alignment | null> {
  const path = join(AUDIO_DIR, `${hash}.json`);
  if (!(await exists(path))) return null;
  return JSON.parse(await readFile(path, "utf8")) as Alignment;
}

export async function clipExists(hash: string): Promise<boolean> {
  return exists(join(AUDIO_DIR, `${hash}.mp3`));
}

/**
 * Speak a piece, handing back audio bytes as they arrive.
 *
 * The reader used to wait for the whole clip - twenty seconds of nothing, for a
 * file the browser could have started playing almost immediately. This returns
 * a stream the `<audio>` element consumes progressively.
 *
 * IT ALSO WRITES BOTH FILES on the way past. That is the load-bearing part: the
 * character timings cannot ride this response (it is audio/mpeg, they are
 * JSON), so the reader fetches them separately - and if that second request
 * synthesised its own copy, every narration would be billed twice. The
 * alignment endpoint waits for the file this writes instead.
 *
 * The cache is unchanged: same hash, same `<hash>.mp3`, so a replay is still
 * free and still served statically.
 */
export async function streamNarration(
  text: string,
  pieceId: string,
  languageCode: string,
): Promise<ReadableStream<Uint8Array>> {
  const { apiKey, modelId, maxChars } = config();
  const voiceId = narrationVoiceFor(languageCode);
  if (!apiKey) throw new Error("missing ELEVENLABS_API_KEY");
  if (text.length > maxChars) {
    throw new Error(
      `Text is ${text.length} characters, over the ${maxChars} limit for one request.`,
    );
  }

  const hash = narrationHash(text, languageCode);
  const began = Date.now();
  // Claimed before the request, not after it. ElevenLabs takes a couple of
  // seconds just to return headers, and a slot claimed afterwards would leave
  // that window wide open to a second request paying for the same clip.
  const release = beginSynthesis(hash);
  let res: Response;
  try {
    res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream/with-timestamps`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: await settingsFor(voiceId),
        }),
      },
    );
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 300)}`);
    }
  } catch (err) {
    release();
    throw err;
  }
  console.log(`tts narration ${text.length}ch: headers after ${Date.now() - began}ms`);

  return pipeChunks(
    res.body!,
    hash,
    () => record(hash, pieceId, voiceId, modelId, text.length),
    began,
    `narration ${text.length}ch`,
    release,
  );
}

/** The same, for a conversation. See narrateDialogue for the casting rules. */
export async function streamDialogue(
  turns: Turn[],
  speakers: Speaker[],
  pieceId: string,
  languageCode: string,
): Promise<ReadableStream<Uint8Array>> {
  const { apiKey, maxChars, dialogueModelId } = config();
  if (!apiKey) throw new Error("missing ELEVENLABS_API_KEY");

  const inputs = dialogueInputs(turns, speakers, pieceId, languageCode);
  const characters = inputs.reduce((n, i) => n + i.text.length, 0);
  if (characters > maxChars) {
    throw new Error(
      `Dialogue is ${characters} characters, over the ${maxChars} limit for one request.`,
    );
  }

  const hash = dialogueHash(inputs);
  const began = Date.now();
  const release = beginSynthesis(hash);
  let res: Response;
  try {
    res = await fetch(
      "https://api.elevenlabs.io/v1/text-to-dialogue/stream/with-timestamps",
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs, model_id: dialogueModelId }),
      },
    );
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(`ElevenLabs dialogue ${res.status}: ${detail.slice(0, 300)}`);
    }
  } catch (err) {
    release();
    throw err;
  }
  console.log(`tts dialogue ${characters}ch: headers after ${Date.now() - began}ms`);

  return pipeChunks(
    res.body!,
    hash,
    () =>
      record(
        hash,
        pieceId,
        [...new Set(inputs.map((i) => i.voice_id))].join("+"),
        dialogueModelId,
        characters,
      ),
    began,
    `dialogue ${characters}ch`,
    release,
  );
}

/**
 * Turn ElevenLabs' newline-delimited JSON into audio bytes, accumulating the
 * timings and writing both files when the stream ends.
 *
 * The endpoint does NOT return raw mp3: each line is a JSON object carrying a
 * base64 chunk plus the alignment for that chunk. So this cannot be a plain
 * pipe-through - every line has to be parsed and decoded.
 *
 * Files are written only after the upstream stream ends cleanly. A half-written
 * cache entry would be served to the next reader as a complete clip, and the
 * hash would stop anyone ever regenerating it.
 *
 * Which is why a reader who navigates away mid-clip does NOT abort the upstream
 * read. ElevenLabs bills per character synthesised, and by then it has already
 * synthesised them: dropping the connection would throw away audio that has been
 * paid for, and the next tap on Listen would pay for it a second time. So the
 * download is drained to the end regardless of who is still listening, and the
 * clip lands in the cache either way.
 *
 * Exported only so scripts/check-tts-pipe.ts can drive it with a fake upstream -
 * the stall this used to have was invisible to every other kind of test.
 */
export function pipeChunks(
  body: ReadableStream<Uint8Array>,
  hash: string,
  onComplete: () => void,
  began: number,
  label: string,
  release: () => void = () => {},
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let firstByte = 0;
  const decoder = new TextDecoder();
  const audio: Buffer[] = [];
  const characters: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  let pending = "";
  let saved = false;

  const take = (line: string) => {
    if (!line.trim()) return null;
    const chunk = JSON.parse(line) as StreamChunk;
    if (chunk.alignment) {
      characters.push(...chunk.alignment.characters);
      starts.push(...chunk.alignment.character_start_times_seconds);
      ends.push(...chunk.alignment.character_end_times_seconds);
    }
    if (!chunk.audio_base64) return null;
    const bytes = Buffer.from(chunk.audio_base64, "base64");
    audio.push(bytes);
    if (!firstByte) {
      firstByte = Date.now() - began;
      // The number this whole change exists to move: how long the reader waits
      // before hearing anything, as opposed to how long the clip takes to make.
      console.log(`tts ${label}: first audio after ${firstByte}ms`);
    }
    return bytes;
  };

  /** One upstream read, decoded. `done` means the clip is complete. */
  const step = async (): Promise<{ done: boolean; bytes: Buffer[] }> => {
    const { done, value } = await reader.read();
    if (done) {
      const last = take(pending);
      pending = "";
      return { done: true, bytes: last ? [last] : [] };
    }
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split("\n");
    // The last piece may be half a line; keep it for the next read.
    pending = lines.pop() ?? "";
    const bytes: Buffer[] = [];
    for (const line of lines) {
      const b = take(line);
      if (b) bytes.push(b);
    }
    return { done: false, bytes };
  };

  const save = async () => {
    if (saved) return;
    saved = true;
    try {
      await mkdir(AUDIO_DIR, { recursive: true });
      await writeFile(join(AUDIO_DIR, `${hash}.mp3`), Buffer.concat(audio));
      if (characters.length) {
        await writeFile(
          join(AUDIO_DIR, `${hash}.json`),
          JSON.stringify({ characters, starts, ends } satisfies Alignment),
        );
      }
      onComplete();
      console.log(
        `tts ${label}: complete after ${Date.now() - began}ms ` +
          `(${audio.reduce((n, b) => n + b.length, 0)} bytes, first audio ${firstByte}ms)`,
      );
    } finally {
      // Last, and unconditionally: anyone waiting on this clip is waiting to
      // look for the file, so they must not be woken before it is there - and
      // must be woken even if writing it failed, or they wait for ever.
      release();
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      // Loop until something is actually enqueued, or the clip ends.
      //
      // This is not an optimisation, it is the difference between working and
      // hanging forever. A pull() that resolves without enqueuing anything is
      // never retried: the stream clears its `pulling` flag, finds no reason to
      // pull again, and the read request that triggered it is left unanswered.
      //
      // One upstream read is nowhere near a complete line - the endpoint sends
      // ~10KB of JSON per chunk and undici hands it over in ~1.8KB pieces - so
      // the first pull produced no audio, and the response stalled on its first
      // byte until the connection was torn down.
      try {
        for (;;) {
          const { done, bytes } = await step();
          for (const b of bytes) controller.enqueue(b);
          if (done) {
            await save();
            controller.close();
            return;
          }
          if (bytes.length) return;
        }
      } catch (err) {
        // The upstream broke. Free the clip so the next request can try it,
        // rather than leaving it claimed by an attempt that is already dead.
        release();
        throw err;
      }
    },
    cancel() {
      // Nobody is listening any more, but the characters are already bought.
      // Finish the download in the background and cache it; a failure here just
      // means no file is written, and the next request synthesises cleanly.
      void (async () => {
        try {
          for (;;) {
            const { done } = await step();
            if (done) break;
          }
          await save();
        } catch (err) {
          console.error("tts stream drain failed", err);
          release();
        }
      })();
    },
  });
}

/**
 * Synthesise `text`, or return the cached file if this exact text has been
 * spoken before in this voice and model.
 */
export async function narrate(
  text: string,
  pieceId: string,
  languageCode: string,
): Promise<Narration> {
  const { apiKey, modelId, maxChars } = config();
  const voiceId = narrationVoiceFor(languageCode);
  if (!apiKey) throw new Error("missing ELEVENLABS_API_KEY");

  if (text.length > maxChars) {
    // A backstop against a surprise bill, mirroring the extension's cap.
    throw new Error(
      `Text is ${text.length} characters, over the ${maxChars} limit for one request.`,
    );
  }

  const hash = narrationHash(text, languageCode);

  const cached = await readCached(hash);
  if (cached) return { ...cached, characters: text.length, cached: true };

  // Somebody may be part-way through buying this exact audio - two taps on the
  // same word do it easily, since a word is short enough to tap twice inside one
  // synthesis. Wait for theirs rather than buying a second copy.
  const shared = await cachedAfterInFlight(hash);
  if (shared) return { ...shared, characters: text.length, cached: true };

  const release = beginSynthesis(hash);
  try {
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
          voice_settings: await settingsFor(voiceId),
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
  } finally {
    release();
  }
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
  languageCode: string,
): Promise<Narration> {
  const { apiKey, maxChars, dialogueModelId } = config();
  if (!apiKey) throw new Error("missing ELEVENLABS_API_KEY");

  const inputs = dialogueInputs(turns, speakers, pieceId, languageCode);
  const characters = inputs.reduce((n, i) => n + i.text.length, 0);
  if (characters > maxChars) {
    throw new Error(
      `Dialogue is ${characters} characters, over the ${maxChars} limit for one request.`,
    );
  }

  const hash = dialogueHash(inputs);

  const cached = await readCached(hash);
  if (cached) return { ...cached, characters, cached: true };

  const shared = await cachedAfterInFlight(hash);
  if (shared) return { ...shared, characters, cached: true };

  const release = beginSynthesis(hash);
  try {
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
  } finally {
    release();
  }
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
