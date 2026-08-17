/**
 * What this app reports about its own registered users.
 *
 * Contract: `gtfoo/docs/user-counts.md`. One file per app in the directory the
 * apps already write to, rendered by `gtfoo.com/admin`. The dashboard never
 * reads this database - four schemas reached into from one page break the first
 * time any of them migrates, and "registered" is ours to define.
 *
 * COUNTS ONLY, NEVER IDENTIFIERS. No emails, no user ids, no per-person
 * timestamps. A shared file one app writes and another reads is the wrong place
 * to widen what is known about a reader, and no feature here needs more than a
 * number.
 *
 * The definition is the whole difficulty, and getting it wrong would publish a
 * fabricated number rather than a wrong one - see `registeredUsers` below.
 */
import { renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "./db";

const APP = "1-percent-more-fluent";
const USAGE_DIR = () => process.env.USAGE_DIR ?? "/var/lib/usage";

interface UserCounts {
  total: number;
  magic_link: number | null;
  passkey: number | null;
  active_30d: number | null;
}

/**
 * `users` IS NOT THE ANSWER, and this is the trap in this app specifically.
 *
 * `getOrCreateUserId` mints a row for every anonymous cookie, so the table
 * counts browsers, not people: 21 rows in production against **one** account
 * that has ever signed in. Reporting 21 would be exactly the fabricated number
 * gtfoo excluded LearnIndo from this panel for - one incognito window would be
 * a new "registered user".
 *
 * An address is the thing that makes a row an account here: it can only be set
 * by completing a sign-in, and the passkey provider refuses to mint an account
 * from a passkey alone (see `getUserInfo` in auth.ts), so there is no way to
 * hold a passkey without having arrived by email first.
 */
function registeredUsers(): UserCounts {
  const db = getDb();
  const one = (sql: string): number =>
    (db.prepare(sql).get() as { n: number }).n;

  const total = one(
    "SELECT COUNT(*) AS n FROM users WHERE email IS NOT NULL AND email != ''",
  );

  // null vs 0, the same rule as `usd: null`. `null` is "this app does not offer
  // that method"; `0` is "it does and nobody has used it yet". Both are decided
  // by configuration, because that is what decides whether the method is on the
  // sign-in page - a count of zero from a provider that is switched off would
  // advertise a capability the reader cannot use.
  const offersMagicLink = Boolean(process.env.AUTH_RESEND_KEY);
  const offersPasskeys = Boolean(process.env.AUTH_PASSKEYS) && offersMagicLink;

  return {
    total,
    // Auth.js stamps `email_verified` when the link is followed, so this counts
    // accounts that actually completed the email flow rather than ones that
    // merely have an address on the row.
    magic_link: offersMagicLink
      ? one("SELECT COUNT(*) AS n FROM users WHERE email_verified IS NOT NULL")
      : null,
    passkey: offersPasskeys
      ? one("SELECT COUNT(DISTINCT user_id) AS n FROM authenticators")
      : null,
    /**
     * Null because it is UNMEASURED here, not because it is zero.
     *
     * Sessions are JWTs, so there is no session table and no record of when
     * anybody last signed in - that was a deliberate trade for not doing a
     * database round-trip on every render. This app does know when a reader last
     * READ something, but that is a different question from the one the field
     * asks, and answering a question nobody asked is how a dashboard starts
     * lying quietly.
     */
    active_30d: null,
  };
}

/**
 * Write the file, atomically, and never let it matter.
 *
 * Temp file in the same directory then `rename`, because the panel reads these
 * concurrently and a truncating writer lets it read half a JSON document. Same
 * directory matters: `rename` is only atomic within a filesystem.
 *
 * Fire and forget, like usage emission. A reader signing in must never fail
 * because a dashboard wanted a number.
 */
export function writeUserCounts(): void {
  try {
    const dir = USAGE_DIR();
    const body = JSON.stringify({
      app: APP,
      // UTC, so string comparison sorts chronologically - the same rule the
      // usage schema gives for its timestamps.
      generated: new Date().toISOString(),
      users: registeredUsers(),
    });

    // The pid keeps two concurrent writers from sharing a temp name; the rename
    // then makes whichever lands second the winner, which is fine - they differ
    // only by a timestamp.
    const tmp = join(dir, `.${APP}.users.json.${process.pid}.tmp`);
    writeFileSync(tmp, body + "\n", { mode: 0o644 });
    renameSync(tmp, join(dir, `${APP}.users.json`));
  } catch (err) {
    console.warn(
      `user counts: not written (${err instanceof Error ? err.message : String(err)}). ` +
        `The admin panel will show its empty state; nothing else is affected.`,
    );
  }
}
