/**
 * Splitting a conversation into speaker turns.
 *
 * Shared by the server (which sends the spoken half to the dialogue API) and
 * the client (which renders the speaker label separately from the line, and
 * maps audio timings onto the words). Both sides must agree exactly: the
 * character offsets used for highlighting are derived from this split.
 */

export interface Speaker {
  name: string;
  gender: "female" | "male";
}

export interface Turn {
  /** The declared speaker, or null if the line carried no recognised prefix. */
  speaker: string | null;
  /** The words actually spoken - never includes the speaker's name. */
  text: string;
  /**
   * Offset of `text` within the concatenation of every turn's text. This is the
   * coordinate space the dialogue API's alignment comes back in, because the
   * speaker names are never sent to it.
   */
  offset: number;
}

/** A name prefix is at most this long; anything more is prose containing a colon. */
const MAX_NAME_LENGTH = 32;

/**
 * Both colons, because CJK text uses the full-width one and a model writing
 * Chinese reaches for it without being asked. Matching only ":" meant Chinese
 * turns never split: the speaker's name stayed inside the line, so it was read
 * aloud by the narrator, rendered as prose the learner is expected to know, and
 * left every turn without a speaker to match a voice to.
 */
const COLON = /[:：]/;

/**
 * Split conversation paragraphs into turns.
 *
 * The prefix is matched against the declared speaker names where possible,
 * which is far more robust than a bare regex - Spanish and Chinese both use
 * colons mid-sentence, and a greedy split would silently eat half a line.
 */
export function splitTurns(paragraphs: string[], speakers: Speaker[]): Turn[] {
  const names = new Set(speakers.map((s) => s.name.trim().toLowerCase()));
  const turns: Turn[] = [];
  let offset = 0;

  for (const paragraph of paragraphs) {
    const colon = paragraph.search(COLON);
    let speaker: string | null = null;
    let text = paragraph.trim();

    if (colon > 0 && colon <= MAX_NAME_LENGTH) {
      const candidate = paragraph.slice(0, colon).trim();
      // Accept a declared speaker, or - when the generator forgot to declare
      // them - anything short and name-shaped.
      if (names.has(candidate.toLowerCase()) || (names.size === 0 && !candidate.includes(" "))) {
        speaker = candidate;
        text = paragraph.slice(colon + 1).trim();
      }
    }

    turns.push({ speaker, text, offset });
    offset += text.length;
  }

  return turns;
}

/** The exact string the dialogue API receives, and that its timings index into. */
export function spokenText(turns: Turn[]): string {
  return turns.map((t) => t.text).join("");
}
