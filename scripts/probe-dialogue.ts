/**
 * Probe the ElevenLabs Text to Dialogue API: does this key have access, and
 * does it return the character timings the reader needs for highlighting?
 *
 *   npx tsx scripts/probe-dialogue.ts
 *
 * Deliberately tiny - about 60 characters - because this spends real quota.
 */
import { readFileSync } from "node:fs";

function loadEnv(path = ".env.local") {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
    }
  } catch {
    /* ambient env */
  }
}
loadEnv();

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("no ELEVENLABS_API_KEY");

const ALICE = "Xb7hH8MSUJpSbSDYk0k2"; // premade, female
const GEORGE = "JBFqnCBsd6RMkjVDRZzb"; // premade, male

const inputs = [
  { text: "Buenos días, ¿cómo estás?", voice_id: ALICE },
  { text: "Muy bien, gracias.", voice_id: GEORGE },
];

async function tryEndpoint(path: string) {
  const url = `https://api.elevenlabs.io/v1/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": key!, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs, model_id: "eleven_v3" }),
  });

  const label = `/v1/${path}`.padEnd(38);
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 220);
    console.log(`${label} ${res.status}  ${detail}`);
    return;
  }

  const type = res.headers.get("content-type") ?? "";
  if (type.includes("json")) {
    const data = (await res.json()) as Record<string, unknown>;
    const keys = Object.keys(data);
    const alignment = data.alignment as { characters?: string[] } | undefined;
    console.log(
      `${label} ${res.status}  json keys: ${keys.join(", ")}` +
        (alignment?.characters
          ? `  ALIGNMENT: ${alignment.characters.length} chars`
          : "  no alignment"),
    );
  } else {
    const buf = await res.arrayBuffer();
    console.log(`${label} ${res.status}  ${type}, ${buf.byteLength} bytes (audio only, no timings)`);
  }
}

async function main() {
  const chars = inputs.reduce((n, i) => n + i.text.length, 0);
  console.log(`Probing with ${chars} characters across ${inputs.length} turns.\n`);
  await tryEndpoint("text-to-dialogue");
  await tryEndpoint("text-to-dialogue/with-timestamps");
}

main().catch((e) => console.error(e));
