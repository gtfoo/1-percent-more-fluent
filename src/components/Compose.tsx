"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FORMATS, type Format } from "@/lib/formats";
import type { Length } from "@/lib/level";
import { PLACEHOLDERS, type Suggestion } from "@/lib/suggestions";
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

export function Compose({
  ttsReady,
  t,
  // Ordered on the server by what this reader has read; see
  // src/lib/rank-suggestions.ts. Plain data, so it crosses the boundary safely -
  // unlike the interpolating strings that 500'd every page while the types were
  // perfectly happy.
  suggestions,
}: {
  ttsReady: boolean;
  t: UiStrings;
  suggestions: Record<Format, Suggestion[]>;
}) {
  const router = useRouter();
  const [format, setFormat] = useState<Format>("story");
  const [topic, setTopic] = useState("");
  const [length, setLength] = useState<Length>("medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The piece as it is being written. Shown while the rest - glossary, quiz -
  // is still arriving, which is most of the wait.
  const [draftTitle, setDraftTitle] = useState("");
  const [draftParagraphs, setDraftParagraphs] = useState<string[]>([]);

  /**
   * Generate, showing the text as it is written rather than after.
   *
   * The response is newline-delimited JSON: any number of `text` events as the
   * prose grows, then one `done` carrying the id of the stored piece, or one
   * `error`. Errors arrive as events rather than as a status, because by the
   * time anything can fail the 200 has long since been sent.
   */
  async function generate() {
    if (!topic.trim()) return;
    setBusy(true);
    setError(null);
    setDraftTitle("");
    setDraftParagraphs([]);
    try {
      const res = await fetch("/api/generate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, topic, length }),
      });
      // A refusal - no model, rate limited, no profile - still comes back as
      // ordinary JSON with a status, before the stream starts.
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t.generationFailed);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let navigated = false;

      const handle = (raw: string) => {
        if (!raw.trim()) return;
        const event = JSON.parse(raw);
        if (event.type === "text") {
          setDraftTitle(event.title ?? "");
          setDraftParagraphs(event.paragraphs ?? []);
        } else if (event.type === "done") {
          navigated = true;
          router.push(`/read/${event.id}`);
        } else if (event.type === "error") {
          throw new Error(event.error ?? t.generationFailed);
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        // The last piece may be half a line; keep it for the next read.
        pending = lines.pop() ?? "";
        for (const l of lines) handle(l);
      }
      handle(pending);

      // The stream ended without ever saying which piece was written. Nothing
      // to navigate to, so say so rather than sitting on a spinner.
      if (!navigated) throw new Error(t.generationFailed);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.somethingWentWrong);
      setBusy(false);
      setDraftParagraphs([]);
      setDraftTitle("");
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
              {suggestions[format].map((s) => (
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

      {busy && draftParagraphs.length === 0 && (
        <p className="text-sm text-muted">
          {t.writingNote}
        </p>
      )}

      {/*
        The piece as it is written. Deliberately plain: no tapping, no glossary,
        no audio, because none of that exists until the generation finishes and
        the piece is stored. It is here to be READ - the reader gets through the
        first paragraph or two while the glossary and quiz are still being
        written, and lands on the real reader with the same words already
        familiar.

        Same type sizes and spacing as the reader, so arriving there is a change
        of capability rather than a change of appearance.
      */}
      {busy && draftParagraphs.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-5" aria-busy="true">
          {draftTitle && (
            <h2 className="mb-3 text-xl font-semibold leading-snug">{draftTitle}</h2>
          )}
          <div className="space-y-3 text-lg leading-relaxed">
            {draftParagraphs.map((p, i) => (
              // Index keys: paragraphs are append-only here and the last one
              // grows in place, which is exactly the case an index key suits.
              <p key={i}>{p}</p>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">{t.writingNote}</p>
        </div>
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
