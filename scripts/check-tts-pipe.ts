/**
 * Assert the audio stream actually flows, and always ends up cached.
 *
 *   DATA_DIR=/tmp/check-tts-pipe npx tsx scripts/check-tts-pipe.ts
 *
 * No network and no ElevenLabs key: the upstream is a fake that imitates the
 * shape of the real one, which is the only part that matters here.
 *
 * That shape is the whole point. The endpoint sends newline-delimited JSON with
 * roughly 10KB of base64 on each line, and undici hands that over in ~1.8KB
 * pieces, so MOST upstream reads do not complete a line and therefore produce no
 * audio to pass on. A pull() that returns having enqueued nothing is never
 * called again - the stream clears its pulling flag, sees no reason to pull, and
 * the read request that started it is never answered. The first release stalled
 * on its first byte for exactly this reason and looked, from outside, like a
 * slow API: headers in 2.4s, then nothing at all until the connection was torn
 * down five minutes later.
 *
 * So the assertions are about liveness, not just correctness. Each one runs
 * under a timeout, because the failure being guarded against is a hang.
 */
import { mkdtempSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let failures = 0;

function ok(name: string, condition: boolean, detail = "") {
  if (!condition) failures++;
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

/** Reject rather than hang, so a stall is a failed check and not a dead script. */
function within<T>(ms: number, what: string, p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${what} did not finish within ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * An upstream that behaves like ElevenLabs': big JSON lines, small transport
 * chunks, so line boundaries and read boundaries do not line up.
 */
function fakeUpstream(lines: number, sliceBytes = 1800): ReadableStream<Uint8Array> {
  const encoded: string[] = [];
  for (let i = 0; i < lines; i++) {
    encoded.push(
      JSON.stringify({
        audio_base64: Buffer.alloc(2000, i + 1).toString("base64"),
        alignment: {
          characters: [`${i}a`, `${i}b`],
          character_start_times_seconds: [i, i + 0.5],
          character_end_times_seconds: [i + 0.5, i + 1],
        },
      }),
    );
  }
  const payload = Buffer.from(encoded.join("\n") + "\n");
  let off = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (off >= payload.length) {
        c.close();
        return;
      }
      c.enqueue(payload.subarray(off, off + sliceBytes));
      off += sliceBytes;
    },
  });
}

async function main() {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "check-tts-pipe-"));
  const { pipeChunks, AUDIO_DIR } = await import("../src/server/tts");

  // --- it streams at all -------------------------------------------------
  {
    let completed = false;
    const stream = pipeChunks(fakeUpstream(3), "flows", () => (completed = true), Date.now(), "check");
    const reader = stream.getReader();
    let chunks = 0;
    let bytes = 0;
    await within(
      5000,
      "streaming three lines",
      (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks++;
          bytes += value.length;
        }
      })(),
    );
    ok("audio comes out of the stream", chunks === 3, `${chunks} chunks`);
    ok("...all of it", bytes === 6000, `${bytes} bytes`);
    ok("...and the spend is recorded once", completed);
  }

  // The regression that motivated this file: one line spread over many reads
  // means the first pulls yield nothing, and a naive pull() hangs there.
  {
    const stream = pipeChunks(fakeUpstream(1, 64), "tiny-slices", () => {}, Date.now(), "check");
    const reader = stream.getReader();
    const first = await within(5000, "first byte with a line split across ~45 reads", reader.read());
    ok("a line split across many reads still yields audio", !first.done && first.value.length > 0);
    await within(5000, "draining the rest", (async () => {
      for (;;) if ((await reader.read()).done) break;
    })());
  }

  // --- the timings land beside the clip ----------------------------------
  {
    const stream = pipeChunks(fakeUpstream(2), "written", () => {}, Date.now(), "check");
    const reader = stream.getReader();
    await within(5000, "draining", (async () => {
      for (;;) if ((await reader.read()).done) break;
    })());
    const files = await readdir(AUDIO_DIR);
    ok("the clip is cached", files.includes("written.mp3"));
    ok("...with its alignment beside it", files.includes("written.json"));
    const alignment = JSON.parse(await readFile(join(AUDIO_DIR, "written.json"), "utf8"));
    ok(
      "the alignment spans every line, not just the last",
      alignment.characters.length === 4,
      `${alignment.characters.length} characters`,
    );
    ok(
      "...and its timings stay in step with it",
      alignment.starts.length === 4 && alignment.ends.length === 4,
    );
  }

  // --- a reader who leaves does not make us pay twice --------------------
  {
    let completed = false;
    const stream = pipeChunks(fakeUpstream(3), "abandoned", () => (completed = true), Date.now(), "check");
    const reader = stream.getReader();
    await within(5000, "first byte", reader.read());
    // Navigating away. The characters are already bought by this point.
    await reader.cancel();
    // The drain runs detached, so give it a moment to land.
    for (let i = 0; i < 50 && !completed; i++) await new Promise((r) => setTimeout(r, 20));
    const files = await readdir(AUDIO_DIR);
    ok("a cancelled listen still caches the clip", files.includes("abandoned.mp3"), );
    ok("...so the next tap is free", completed);
    const mp3 = await readFile(join(AUDIO_DIR, "abandoned.mp3"));
    ok("...and it is the whole clip, not the part that was heard", mp3.length === 6000, `${mp3.length} bytes`);
  }

  // --- a broken upstream leaves nothing behind ---------------------------
  {
    const upstream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(Buffer.from('{"audio_base64":"'));
        c.error(new Error("connection dropped"));
      },
    });
    const stream = pipeChunks(upstream, "broken", () => {}, Date.now(), "check");
    const reader = stream.getReader();
    let threw = false;
    try {
      await within(5000, "reading a broken stream", (async () => {
        for (;;) if ((await reader.read()).done) break;
      })());
    } catch {
      threw = true;
    }
    const files = await readdir(AUDIO_DIR);
    ok("a dropped connection surfaces as an error", threw);
    ok(
      "...and caches no half-clip that would be served as whole",
      !files.includes("broken.mp3"),
    );
  }

  // --- two listeners, one synthesis ---------------------------------------
  //
  // The state that used to be missing entirely: not "is there a clip" but "is
  // somebody buying this clip right now". Without it a second request finds no
  // file and starts paying too.
  {
    const { synthesisInFlight, beginSynthesis } = await import("../src/server/tts");
    let released = false;
    const claim = beginSynthesis("shared");
    const stream = pipeChunks(fakeUpstream(3), "shared", () => {}, Date.now(), "check", () => {
      released = true;
      claim();
    });
    ok("a synthesis in progress is visible to other requests", synthesisInFlight("shared") !== null);
    ok("...and an unrelated clip is not", synthesisInFlight("some-other-clip") === null);

    const waiter = synthesisInFlight("shared")!;
    let woken = false;
    void waiter.then(() => (woken = true));

    const reader = stream.getReader();
    await within(5000, "first byte", reader.read());
    ok("...a waiter is not woken while bytes are still arriving", !woken);

    await within(5000, "draining", (async () => {
      for (;;) if ((await reader.read()).done) break;
    })());
    await within(5000, "the waiter being woken", waiter);
    ok("...and is woken once the clip is finished", released);
    ok(
      "...by which time the file it was waiting for exists",
      (await readdir(AUDIO_DIR)).includes("shared.mp3"),
    );
    ok("...and the slot is free again", synthesisInFlight("shared") === null);
  }

  // A failed attempt must not leave the clip claimed for the life of the
  // process - that would make one broken connection permanent.
  {
    const { synthesisInFlight, beginSynthesis } = await import("../src/server/tts");
    const upstream = new ReadableStream<Uint8Array>({
      start(c) {
        c.error(new Error("connection dropped"));
      },
    });
    let released = false;
    const claim = beginSynthesis("failed");
    const stream = pipeChunks(upstream, "failed", () => {}, Date.now(), "check", () => {
      released = true;
      claim();
    });
    const reader = stream.getReader();
    try {
      await within(5000, "reading a broken stream", reader.read());
    } catch {
      /* expected */
    }
    ok("a failed synthesis releases its claim", released);
    ok("...so the clip can be attempted again", synthesisInFlight("failed") === null);
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failing`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
