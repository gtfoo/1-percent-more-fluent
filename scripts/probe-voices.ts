/**
 * List the ElevenLabs voices this API key can actually use, and report the
 * account's remaining character quota.
 *
 * Worth having as a script: ElevenLabs reclassifies voices, and a voice that
 * worked last month can start returning 402 "paid_plan_required" without any
 * change on our side.
 *
 *   npx tsx scripts/probe-voices.ts
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

async function main() {
  const sub = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
    headers: { "xi-api-key": key! },
  });
  if (sub.ok) {
    const d = (await sub.json()) as {
      tier: string;
      character_count: number;
      character_limit: number;
      next_character_count_reset_unix: number;
    };
    console.log(
      `tier=${d.tier}  used=${d.character_count.toLocaleString()}/${d.character_limit.toLocaleString()}  ` +
        `left=${(d.character_limit - d.character_count).toLocaleString()}  ` +
        `resets ${new Date(d.next_character_count_reset_unix * 1000).toISOString().slice(0, 10)}`,
    );
  } else {
    console.log(`subscription check failed: ${sub.status} (key may lack User read access)`);
  }

  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": key! },
  });
  if (!res.ok) throw new Error(`voices ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as {
    voices: { voice_id: string; name: string; category: string; labels?: Record<string, string> }[];
  };

  const byCategory = new Map<string, typeof data.voices>();
  for (const v of data.voices) {
    if (!byCategory.has(v.category)) byCategory.set(v.category, []);
    byCategory.get(v.category)!.push(v);
  }

  for (const [category, voices] of byCategory) {
    console.log(`\n--- ${category} (${voices.length}) ---`);
    for (const v of voices) {
      const labels = v.labels
        ? Object.entries(v.labels).map(([k, val]) => `${k}=${val}`).join(" ")
        : "";
      console.log(`  ${v.voice_id}  ${v.name.padEnd(14)} ${labels}`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
