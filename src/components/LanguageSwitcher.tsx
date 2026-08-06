"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export interface PlacedLanguage {
  code: string;
  /** The language's own name, e.g. "Simplified Chinese". */
  name: string;
  label: string;
}

/**
 * Switch which language you are reading.
 *
 * Each language keeps its own level, so switching is just repointing - nothing
 * is lost and nothing needs re-taking. That is the whole reason profiles are
 * keyed per language now; before this, choosing Chinese overwrote your Spanish
 * level and there was deliberately no button for it.
 *
 * The names are always written in English rather than in each language's own
 * script. This is the one control that must stay readable when the rest of the
 * UI has switched to a language you are still learning - if you cannot find
 * your way back, the app has trapped you.
 */
export function LanguageSwitcher({
  current,
  placed,
}: {
  current: PlacedLanguage;
  placed: PlacedLanguage[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const others = placed.filter((p) => p.code !== current.code);

  async function choose(code: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: code }),
      });
      if (!res.ok) throw new Error();
      setOpen(false);
      // Server components hold the level and the reading history, so the whole
      // route has to re-render rather than just this control.
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // Nothing to switch between yet: still worth offering the second language.
  if (!others.length && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-muted underline decoration-dotted underline-offset-4 hover:text-accent"
      >
        {current.name}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="text-sm text-muted underline decoration-dotted underline-offset-4 hover:text-accent"
      >
        {current.name} ▾
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-2 w-60 rounded-lg border border-border bg-surface p-2 shadow-lg">
          {others.map((p) => (
            <button
              key={p.code}
              type="button"
              onClick={() => choose(p.code)}
              disabled={busy}
              className="flex w-full items-baseline justify-between gap-3 rounded px-3 py-2 text-left text-sm hover:bg-accent-soft"
            >
              <span>{p.name}</span>
              <span className="text-muted">{p.label}</span>
            </button>
          ))}
          <Link
            href="/setup"
            className="block rounded px-3 py-2 text-sm text-muted hover:bg-accent-soft"
          >
            Start another language…
          </Link>
        </div>
      )}
    </div>
  );
}
