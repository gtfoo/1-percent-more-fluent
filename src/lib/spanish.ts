/**
 * Spanish text handling shared by the server (difficulty checking) and the
 * client (rendering tappable words). Deliberately dependency-free so the same
 * tokenisation runs on both sides - if they disagreed, the lookup rate we
 * calibrate on would not match the text we verified.
 */

// Built with `new RegExp` so this file stays plain ASCII.
const LETTER = "a-z\\u00e1\\u00e9\\u00ed\\u00f3\\u00fa\\u00fc\\u00f1A-Z\\u00c1\\u00c9\\u00cd\\u00d3\\u00da\\u00dc\\u00d1";
const WORD_RE = new RegExp(`[${LETTER}]+`, "g");
const NON_WORD_RE = new RegExp(`[^${LETTER}]+`);

export interface Token {
  text: string;
  isWord: boolean;
}

/**
 * Split into words and the punctuation between them, preserving everything.
 * Joining `tokens.map(t => t.text)` reproduces the input exactly, which is what
 * lets the reader make each word tappable without altering the prose.
 */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;

  for (const match of text.matchAll(WORD_RE)) {
    const start = match.index;
    if (start > cursor) {
      tokens.push({ text: text.slice(cursor, start), isWord: false });
    }
    tokens.push({ text: match[0], isWord: true });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) {
    tokens.push({ text: text.slice(cursor), isWord: false });
  }
  return tokens;
}

/** Just the word forms, lowercased. Accents are kept - they distinguish words. */
export function words(text: string): string[] {
  return (text.match(WORD_RE) ?? []).map((w) => w.toLowerCase());
}

/** The key a word is stored and looked up under. */
export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(NON_WORD_RE, "");
}

/**
 * Split into sentences. Spanish opens questions and exclamations with an
 * inverted mark but closes them with the same characters as English, so
 * splitting on the closers is enough.
 */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function countWords(text: string): number {
  return words(text).length;
}
