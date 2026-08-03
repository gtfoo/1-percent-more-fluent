"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FORMATS, type Format } from "@/lib/formats";
import type { Length } from "@/lib/level";
import { SUGGESTIONS } from "@/lib/suggestions";

const FORMAT_LABELS: Record<Format, { label: string; hint: string }> = {
  story: { label: "Story", hint: "folklore, a small mystery, something that happened" },
  article: { label: "Article", hint: "the trade war, why volcanoes erupt, a place" },
  conversation: { label: "Conversation", hint: "two friends on the new Spider-Man film" },
};

const LENGTHS: { value: Length; label: string }[] = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
];

export function Compose({ ttsReady }: { ttsReady: boolean }) {
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
      if (!res.ok) throw new Error(data.error ?? "Generation failed.");
      router.push(`/read/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
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
            {FORMAT_LABELS[f].label}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="topic" className="block text-sm font-medium">
          What do you want to read about?
        </label>
        <input
          id="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) generate();
          }}
          maxLength={200}
          placeholder={FORMAT_LABELS[format].hint}
          className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
        />

        {/* Starting points. They fill the box rather than generating straight
            away, so the text stays editable - the point is as much to show what
            a good topic looks like as to save typing. Hidden once something is
            typed, since by then they are only in the way. */}
        {!topic.trim() && (
          <div className="mt-3">
            <p className="text-sm text-muted">Or start from one of these:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    setTopic(s.topic);
                    // The format is part of the idea: an interview is a
                    // conversation, an explainer of a mechanism is an article.
                    setFormat(s.format);
                  }}
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
              {l.label}
            </button>
          ))}
        </div>

        <button
          onClick={generate}
          disabled={busy || !topic.trim()}
          className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Writing…" : "Write it"}
        </button>
      </div>

      {busy && (
        <p className="text-sm text-muted">
          Writing, then checking it against your level and rewriting anything
          too hard. Usually 20–40 seconds.
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
