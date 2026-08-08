"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FORMATS, type Format } from "@/lib/formats";
import type { Length } from "@/lib/level";
import { PLACEHOLDERS, SUGGESTIONS } from "@/lib/suggestions";
import type { UiStrings } from "@/lib/ui-strings";

const LENGTHS: { value: Length }[] = [
  { value: "short" },
  { value: "medium" },
  { value: "long" },
];

/** Labels come from the string set, so they follow the interface language. */
function formatLabel(t: UiStrings, f: Format): string {
  return f === "story" ? t.formatStory : f === "article" ? t.formatArticle : t.formatConversation;
}

function lengthLabel(t: UiStrings, l: Length): string {
  return l === "short" ? t.lengthShort : l === "medium" ? t.lengthMedium : t.lengthLong;
}

export function Compose({ ttsReady, t }: { ttsReady: boolean; t: UiStrings }) {
  const router = useRouter();
  const [format, setFormat] = useState<Format>("story");
  const [topic, setTopic] = useState("");
  const [length, setLength] = useState<Length>("medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!topic.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, topic, length }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t.generationFailed);
      router.push(`/read/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.somethingWentWrong);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {FORMATS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFormat(f)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              format === f
                ? "border-accent bg-accent text-white"
                : "border-border bg-surface hover:border-accent"
            }`}
          >
            {formatLabel(t, f)}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="topic" className="block text-sm font-medium">
          {t.topicLabel}
        </label>
        <input
          id="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) generate();
          }}
          maxLength={200}
          // English even when the rest of the chrome is not, like the
          // suggestion chips below it and for the same reason. See
          // src/lib/suggestions.ts.
          placeholder={PLACEHOLDERS[format]}
          className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
        />

        {/* Starting points. They fill the box rather than generating straight
            away, so the text stays editable - the point is as much to show what
            a good topic looks like as to save typing. Hidden once something is
            typed, since by then they are only in the way. */}
        {!topic.trim() && (
          <div className="mt-3">
            <p className="text-sm text-muted">{t.orStartFrom}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SUGGESTIONS[format].map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setTopic(s.topic)}
                  title={s.topic}
                  className="rounded-full border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          {LENGTHS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => setLength(l.value)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                length === l.value
                  ? "border-accent text-accent"
                  : "border-border text-muted hover:border-accent"
              }`}
            >
              {lengthLabel(t, l.value)}
            </button>
          ))}
        </div>

        <button
          onClick={generate}
          disabled={busy || !topic.trim()}
          className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {busy ? t.writing : t.writeIt}
        </button>
      </div>

      {busy && (
        <p className="text-sm text-muted">
          {t.writingNote}
        </p>
      )}
      {error && <p className="text-warn">{error}</p>}
      {!ttsReady && (
        <p className="text-sm text-muted">
          Audio is off — set <code>ELEVENLABS_API_KEY</code> in{" "}
          <code>.env.local</code> to enable listening.
        </p>
      )}
    </div>
  );
}
