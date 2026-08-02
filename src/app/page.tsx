import Link from "next/link";
import { getUserId, getProfile } from "@/server/user";
import { listPieces } from "@/server/generate";
import { isTtsConfigured, charactersSpent } from "@/server/tts";
import { labelFor, paramsFor } from "@/lib/level";
import { getLanguage } from "@/lib/languages";
import { Compose } from "@/components/Compose";

export default async function Home() {
  const userId = await getUserId();
  const profile = userId ? getProfile(userId) : null;

  if (!profile) {
    return (
      <div className="max-w-xl space-y-5">
        <h1 className="text-3xl font-semibold tracking-tight">
          Read Spanish at the level you’re actually at
        </h1>
        <p className="text-muted">
          Tell it what you feel like reading — a folk tale, a piece about the
          trade war, two friends arguing about a film — and it writes one, in
          Spanish, pitched so you understand most of it but not all of it.
        </p>
        <p className="text-muted">
          First, a 90-second vocabulary check. No grammar questions, and you
          don’t need to know your CEFR level.
        </p>
        <Link
          href="/setup"
          className="inline-block rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90"
        >
          Find my level
        </Link>
      </div>
    );
  }

  const language = getLanguage(profile.language);
  const params = paramsFor(profile.level, language);
  const recent = listPieces(profile.userId);
  const spent = charactersSpent();

  return (
    <div className="space-y-10">
      <section className="rounded-xl border border-border bg-surface px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Your level</p>
            <p className="text-2xl font-semibold">
              {params.label}{" "}
              <span className="text-base font-normal text-muted">
                · about {params.vocabBand.toLocaleString()} words
              </span>
            </p>
          </div>
          <p className="text-sm text-muted">
            Aiming for ~{params.sentenceWords}-word sentences and{" "}
            {Math.round(params.newWordBudget * 100)}% new vocabulary
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold tracking-tight">
          What do you feel like reading?
        </h2>
        <Compose ttsReady={isTtsConfigured()} />
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold tracking-tight">
            Everything you’ve read
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {recent.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/read/${p.id}`}
                  className="flex items-baseline justify-between gap-4 px-5 py-3 hover:bg-accent-soft"
                >
                  <span className="font-medium">{p.title}</span>
                  <span className="shrink-0 text-sm text-muted">
                    {p.format} · {labelFor(p.level, language)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {spent > 0 && (
        <p className="text-sm text-muted">
          Speech synthesised so far: {spent.toLocaleString()} characters ·
          roughly ${((spent / 1000) * 0.1).toFixed(2)} at ElevenLabs’
          multilingual rate. Replays are free.
        </p>
      )}
    </div>
  );
}
