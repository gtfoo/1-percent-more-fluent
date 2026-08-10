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
): { strings: UiStrings; format: UiFormatters; inTarget: boolean; locale: string } {
  const inTarget =
    preference === "target" ||
    (preference === "auto" && level >= language.uiFromLevel);

  return {
    strings: inTarget ? language.ui : EN,
    format: inTarget ? language.uiFormat : EN_FORMAT,
    inTarget,
    locale: localeFor(language, inTarget),
  };
}

/**
 * Which locale to format NUMBERS and DATES in.
 *
 * Not a detail. A bare `toLocaleString()` follows the locale of whatever
 * machine happens to be running the server - en-US on the droplet - so a reader
 * whose entire interface is Spanish was shown "2,269", which in Spanish means
 * two point two six nine. The separators are not decoration; swapping them
 * changes the number by a factor of a thousand.
 *
 * It follows the chrome rather than the language being learned: an English
 * interface should read as English throughout, even while the prose beside it
 * is Indonesian.
 *
 * The language codes are already valid BCP-47 tags ("es", "zh-CN", "id"), so
 * there is nothing to map. Node 20 ships full ICU, so nothing to install
 * either.
 */
export function localeFor(language: Language, inTarget: boolean): string {
  return inTarget ? language.code : "en";
}
