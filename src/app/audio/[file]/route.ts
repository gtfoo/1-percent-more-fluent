import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { AUDIO_DIR } from "@/server/tts";

/**
 * Serve a cached mp3 from the audio directory.
 *
 * The cache cannot live under public/: with `output: "standalone"` a rebuild
 * emits a fresh server directory, so runtime-written files there stop being
 * reachable. Serving it through a route handler instead means dev and
 * production take exactly the same path, and no reverse-proxy rule has to be
 * kept in sync with the app.
 *
 * RANGE REQUESTS ARE NOT OPTIONAL. Browsers ask for byte ranges to seek within
 * audio, and a handler that ignores Range and always returns 200 gives you a
 * clip that plays from the start and cannot be scrubbed.
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/audio/[file]">,
): Promise<Response> {
  const { file } = await ctx.params;

  // The filenames are content hashes we generated, but this is a path taken
  // straight from the URL, so anything that could escape the directory is
  // rejected outright rather than normalised.
  if (!/^[a-f0-9]{8,64}\.(mp3|json)$/.test(file)) {
    return new Response("not found", { status: 404 });
  }

  const path = join(AUDIO_DIR, file);
  let size: number;
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("not a file");
    size = info.size;
  } catch {
    return new Response("not found", { status: 404 });
  }

  const type = file.endsWith(".json") ? "application/json" : "audio/mpeg";
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    // Content-addressed: the name changes whenever the audio does.
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  const range = _req.headers.get("range");
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);

  if (match) {
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;

    if (Number.isNaN(start) || start > end || start >= size) {
      return new Response("range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }

    return new Response(toWebStream(createReadStream(path, { start, end })), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  return new Response(toWebStream(createReadStream(path)), {
    status: 200,
    headers: { ...headers, "Content-Length": String(size) },
  });
}

/** Node stream -> web stream, so it can be handed to a Response body. */
function toWebStream(stream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) =>
        controller.enqueue(
          typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk),
        ),
      );
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      (stream as NodeJS.ReadStream).destroy?.();
    },
  });
}
