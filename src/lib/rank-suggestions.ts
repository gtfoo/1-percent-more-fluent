/**
 * Ordering the starting-point chips by what this reader actually reads.
 *
 * Mostly affinity: keep choosing payments and engineering and those chips move
 * to the front. But two slots near the front are RESERVED for fields with no
 * history at all, and that reservation is the whole design rather than a
 * garnish.
 *
 * The reason is that affinity and this app disagree. A recommender maximises
 * what you will click; a language app has to widen the vocabulary you meet, and
 * read only payments and your Spanish stays payments-shaped. The authored set
 * spans eight fields precisely so it doubles as a breadth check - see the header
 * of suggestions.ts. So affinity leads, and something unread is always visible
 * without having to be hunted for.
 *
 * A PERMUTATION, never a subset. All ten chips render at once (Compose.tsx), so
 * order is the only lever here, and nothing is ever hidden - the breadth
 * guarantee stays literally true rather than depending on rotation to restore
 * it. check-chips.ts asserts this on every case, because the tempting refactor
 * is to start filtering and no existing test would notice.
 *
 * In lib rather than server: it crosses to a client component, and must not drag
 * SQLite into the browser bundle.
 */
import type { Format } from "./formats";
import { SUGGESTIONS, type Suggestion, type TopicField } from "./suggestions";

export interface TopicHistory {
  /** Exactly as typed or filled, compared to Suggestion.topic by equality. */
  topic: string;
  format: Format;
  /** Null for pieces written before the label existed. Inert, not "other". */
  field: TopicField | null;
}

/** How hard a field you keep reading pulls its chips forward. */
const AFFINITY = 1;
/** How hard a topic you have already generated is pushed back. */
const USED = 10;
/** Reserved near the front for fields with no history. */
const EXPLORE_SLOTS = [1, 3];

/**
 * Deterministic, seeded rotation - FNV-1a, no dependency.
 *
 * NOT Math.random(), and this is load-bearing. The home page is server-rendered
 * on every single request, so a random pick makes the chips jump between two
 * refreshes a second apart, which reads as a bug, and it makes the tests need
 * frozen time. The seed is the reader plus how much they have read, so the
 * rotation moves when there is genuinely something new and holds still
 * otherwise.
 */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Recency by POSITION, not by clock. `listPieces` already returns newest first,
 * so the newest piece counts a whole vote and the tenth counts a tenth of one.
 * Using a timestamp instead would make the order drift while nobody did
 * anything.
 */
const weight = (index: number) => 1 / (1 + index);

export function rankSuggestions(
  all: Suggestion[],
  history: TopicHistory[],
  seed: string,
): Suggestion[] {
  if (all.length === 0) return [];

  const affinity = new Map<string, number>();
  for (const [i, h] of history.entries()) {
    if (!h.field) continue;
    affinity.set(h.field, (affinity.get(h.field) ?? 0) + weight(i));
  }
  const alreadyRead = new Set(history.map((h) => h.topic));

  // Stable: the authored index breaks every tie, so an empty history returns
  // the authored order byte for byte.
  const scored = all.map((chip, index) => ({
    chip,
    index,
    score:
      AFFINITY * (affinity.get(chip.field) ?? 0) -
      USED * (alreadyRead.has(chip.topic) ? 1 : 0),
  }));
  const ordered = [...scored]
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((s) => s.chip);

  // Nothing to explore away FROM. With no fields in the history every chip is
  // equally untouched, so lifting two of them would just shuffle the curated
  // order for a reader who has read nothing - which is precisely the reader
  // most entitled to see it as authored. Same for a history of pieces written
  // before the label existed: unlabelled means no opinion, not "other".
  if (affinity.size === 0) return ordered;

  // The reserved slots. A field is untouched only if nothing in the history
  // carries it - a field read once is affinity's business, not exploration's.
  const untouched = all.filter(
    (c) => !affinity.has(c.field) && !alreadyRead.has(c.topic),
  );
  if (untouched.length === 0) return ordered;

  const picked: Suggestion[] = [];
  for (const [n, slot] of EXPLORE_SLOTS.entries()) {
    const pool = untouched.filter((c) => !picked.includes(c));
    if (pool.length === 0) break;
    const chosen = pool[hash(`${seed}:${n}`) % pool.length]!;
    picked.push(chosen);
    // Lift, not swap: removing and reinserting keeps every other chip's
    // relative order, so one new piece nudges the row rather than reshuffling
    // it. A reader should still recognise the layout.
    const from = ordered.indexOf(chosen);
    ordered.splice(from, 1);
    ordered.splice(Math.min(slot, ordered.length), 0, chosen);
  }

  return ordered;
}

/**
 * Every format at once, with the authored set as the floor.
 *
 * The try/catch lives here so the page stays clean and so that a bug in the
 * ranking can never take the home page down with it - the worst case is the
 * chips people had before this existed.
 */
export function rankAll(
  history: TopicHistory[],
  seed: string,
): Record<Format, Suggestion[]> {
  try {
    return {
      story: rankSuggestions(SUGGESTIONS.story, history, seed),
      article: rankSuggestions(SUGGESTIONS.article, history, seed),
      conversation: rankSuggestions(SUGGESTIONS.conversation, history, seed),
    };
  } catch (err) {
    console.error("could not rank the starting points", err);
    return SUGGESTIONS;
  }
}
