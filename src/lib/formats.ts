/**
 * Shared by the client (the compose form) and the server (the generator).
 * Kept out of src/server so importing it does not drag SQLite and node
 * built-ins into the browser bundle.
 */
export const FORMATS = ["story", "article", "conversation"] as const;
export type Format = (typeof FORMATS)[number];
