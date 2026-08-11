"use client";

import { useSyncExternalStore } from "react";
import type { UiStrings } from "@/lib/ui-strings";

export type ThemeChoice = "system" | "light" | "dark";

/**
 * Read by the inline script in layout.tsx as a literal string. If this name
 * changes, change it there too - a mismatch is invisible until someone reloads
 * with a stored choice and watches the page flash.
 */
const KEY = "fluent:theme";

/** Must match the palettes in globals.css. */
const THEME_COLOUR: Record<"light" | "dark", string> = {
  light: "#faf8f5",
  dark: "#14130f",
};

function readStored(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    // Safari private browsing throws on access rather than returning null.
    return "system";
  }
}

/**
 * Apply a choice to the document.
 *
 * "system" REMOVES the attribute rather than writing a resolved value, so the
 * media query takes over again and a device that switches at sunset keeps
 * following along. Writing "light" at noon would freeze it there.
 */
function apply(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;

  // The <meta name="theme-color"> tags from `viewport` are media-scoped, so an
  // explicit choice needs a tag of its own - otherwise the browser chrome keeps
  // tracking the system while the page no longer does, and the phone's status
  // bar ends up cream above a dark page.
  const resolved =
    choice === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : choice;
  let tag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-explicit]');
  if (!tag) {
    tag = document.createElement("meta");
    tag.name = "theme-color";
    tag.dataset.explicit = "true";
    document.head.appendChild(tag);
  }
  tag.content = THEME_COLOUR[resolved];
}

/**
 * Everything currently rendering a toggle, so one tab's choice reaches the
 * others. A module-level set rather than React state: the store here is
 * localStorage, and this is only the notification half of subscribing to it.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab wrote the key. Apply it here as well as re-rendering, or this
  // tab would move its pressed button without changing colour.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== KEY) return;
    apply(readStored());
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Follow the device, or override it.
 *
 * `t` is a plain-strings object, which is the only kind that crosses into a
 * client component - see UiStrings. The labels are translated rather than left
 * in English: this app switches its whole interface above a level, and one
 * English control under otherwise-translated chrome is exactly the half-done
 * look that switch exists to avoid. (The LANGUAGE switcher is the deliberate
 * exception, and for a reason that does not apply here: nobody is locked out of
 * the app by a colour.)
 */
export function ThemeToggle({ t }: { t: UiStrings }) {
  // localStorage IS the state, so it is subscribed to rather than copied into
  // React. Reading it in an effect and calling setState would say the same
  // thing in a way the compiler rightly rejects - and this way a change in
  // another tab arrives here too, through the `storage` event, instead of
  // leaving two open tabs disagreeing about which button is pressed.
  //
  // The server snapshot is always "system": the server cannot know, and the
  // inline script in layout.tsx has already painted the real colours by the
  // time this hydrates. So a first render that says "Auto" is only ever about
  // which button looks pressed, never about the page.
  const choice = useSyncExternalStore(subscribe, readStored, () => "system" as const);

  function pick(next: ThemeChoice) {
    apply(next);
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // The choice still applies for this session; it just will not be
      // remembered. Better than refusing to switch at all.
    }
    // localStorage fires `storage` only in OTHER tabs, so this one has to say
    // so itself or the pressed button would not move.
    listeners.forEach((l) => l());
  }

  const options: { value: ThemeChoice; label: string }[] = [
    { value: "system", label: t.themeAuto },
    { value: "light", label: t.themeLight },
    { value: "dark", label: t.themeDark },
  ];

  return (
    <div
      role="group"
      aria-label={t.themeLabel}
      className="inline-flex overflow-hidden rounded-lg border border-border"
    >
      {options.map((o) => {
        const active = choice === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => pick(o.value)}
            aria-pressed={active}
            // Roomy enough to hit with a thumb. The carpark version this is
            // modelled on sits on a map card at 11px; this one is at the bottom
            // of a reading page, where the tap target matters more than the
            // pixels saved.
            className={`px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-accent text-white"
                : "text-muted hover:bg-accent-soft hover:text-accent"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
