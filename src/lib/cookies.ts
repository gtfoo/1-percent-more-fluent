/**
 * Cookie names, in their own module.
 *
 * Extracted from src/server/user.ts so that auth.ts can read the anonymous
 * identity without importing it: user.ts needs the session to resolve who the
 * reader is, and auth.ts needs the cookie to know whose history to claim. Left
 * where they were, those two would import each other.
 */
export const USER_COOKIE = "fluent_uid";

/**
 * The app was called "Comprensible" before. Renaming the cookie outright would
 * orphan every existing profile and its whole reading history, so the old name
 * is still read and silently adopted. Safe to delete once nobody is carrying
 * one - it has no effect on new readers.
 */
export const LEGACY_USER_COOKIE = "comprensible_uid";
