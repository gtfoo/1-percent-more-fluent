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

export interface AvailableLanguage {
  code: string;
  name: string;
}

/**
 * Switch which language you are reading.
 *
 * Each language keeps its own level, so switching is repointing - nothing is
 * lost and nothing needs re-taking. That is why profiles are keyed per language;
 * before that, choosing Chinese overwrote your Spanish level.
 *
 * Two things this gets right that the first version did not, both found by
 * looking at it as a real user rather than as the two-language case it was
 * built against:
 *
 *  - It always looks like a control. Every user starts with exactly ONE
 *    language, and in that case the first version rendered bare grey text with
 *    no arrow - indistinguishable from the label above it. Nobody would ever
 *    have clicked it.
 *
 *  - It lists languages you have NOT placed in, not just the ones you have.
 *    Offering only "switch between your languages" is useless when you have one:
 *    the thing you actually want is the second language, and it was two
 *    unmarked clicks away.
 *
 * The names are always written in English rather than in each language's own
 * script. This is the one control that must stay readable when the rest of the
 * UI has switched to a language you are still learning - if you cannot find your
 * way back, the app has trapped you.
 */
export function LanguageSwitcher({
  current,
  placed,
  available,
  uiInTarget,
}: {
  current: PlacedLanguage;
  placed: PlacedLanguage[];
  available: AvailableLanguage[];
  /** Whether the interface is currently written in the language being learned. */
  uiInTarget: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const others = placed.filter((p) => p.code !== current.code);

  async function post(body: Record<string, string>) {
    setBusy(true);
    try {
      const res = await fetch("/api/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setOpen(false);
      // The level, the reading history and the suggestions all live in server
      // components, so the whole route re-renders rather than just this control.
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const choose = (code: string) => post({ language: code });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        className="-ml-2 flex items-center gap-1.5 rounded-lg border border-transparent px-2 py-1 text-sm text-muted transition-colors hover:border-border hover:text-foreground"
      >
        {current.name}
        <span aria-hidden className="text-xs">
          ▾
        </span>
      </button>

      {open && (
        <>
          {/* Click-away. Behind the menu, over everything else. */}
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute left-0 z-20 mt-1 w-64 rounded-lg border border-border bg-surface p-1.5 shadow-lg">
            {others.length > 0 && (
              <>
                <p className="px-2.5 py-1 text-xs uppercase tracking-wide text-muted">
                  Switch to
                </p>
                {others.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => choose(p.code)}
                    disabled={busy}
                    className="flex w-full items-baseline justify-between gap-3 rounded px-2.5 py-2 text-left text-sm hover:bg-accent-soft"
                  >
                    <span>{p.name}</span>
                    <span className="text-muted">{p.label}</span>
                  </button>
                ))}
              </>
            )}

            {available.length > 0 && (
              <>
                <p className="px-2.5 pb-1 pt-2 text-xs uppercase tracking-wide text-muted">
                  Start learning
                </p>
                {available.map((l) => (
                  <Link
                    key={l.code}
                    href={`/setup?language=${l.code}`}
                    className="flex w-full items-baseline justify-between gap-3 rounded px-2.5 py-2 text-left text-sm hover:bg-accent-soft"
                  >
                    <span>{l.name}</span>
                    <span className="text-xs text-muted">90-second check</span>
                  </Link>
                ))}
              </>
            )}

            {/* Written in English whatever the interface is set to. This is the
                way back out: an interface in a language you cannot yet read is
                a room with the lights off, and the switch has to be findable
                from inside it. */}
            <button
              type="button"
              onClick={() => post({ ui: uiInTarget ? "english" : "target" })}
              disabled={busy}
              className="mt-1 block w-full border-t border-border px-2.5 pb-1 pt-2 text-left text-sm text-muted hover:text-accent"
            >
              {uiInTarget
                ? "Show the interface in English"
                : `Show the interface in ${current.name}`}
            </button>

            <Link
              href="/setup"
              className="block px-2.5 py-1 text-sm text-muted hover:text-accent"
            >
              Re-take my level check
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
