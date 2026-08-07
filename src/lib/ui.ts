/**
 * Which language the INTERFACE is in.
 *
 * Separate from which language you are learning: a beginner reads Chinese prose
 * inside English chrome, and somewhere above the middle of the scale that
 * chrome starts being the thing interrupting them rather than the thing helping.
 */
import type { Language } from "./languages";
import { EN, EN_FORMAT, type UiFormatters, type UiStrings } from "./ui-strings";

/** What the reader has explicitly asked for, if anything. */
export type UiPreference = "auto" | "english" | "target";

export const UI_COOKIE = "fluent_ui";

export function parseUiPreference(value: string | undefined): UiPreference {
  return value === "english" || value === "target" ? value : "auto";
}

/**
 * The strings to render, and whether they are the target language.
 *
 * `auto` follows the level. The override exists because getting this wrong is
 * not symmetrical: an interface in a language you cannot yet read is a room
 * with the lights off, and the threshold is a guess about a person from one
 * number. Either direction can be forced, and the control that forces it is
 * always written in English - see LanguageSwitcher.
 */
export function uiFor(
  language: Language,
  level: number,
  preference: UiPreference = "auto",
): { strings: UiStrings; format: UiFormatters; inTarget: boolean } {
  const inTarget =
    preference === "target" ||
    (preference === "auto" && level >= language.uiFromLevel);

  return {
    strings: inTarget ? language.ui : EN,
    format: inTarget ? language.uiFormat : EN_FORMAT,
    inTarget,
  };
}
