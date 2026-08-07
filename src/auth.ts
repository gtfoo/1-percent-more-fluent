/**
 * Signing in, which is optional.
 *
 * Reading anonymously on a cookie is still the whole product. An account exists
 * for one reason: so a level built over weeks follows you to your phone. Nobody
 * is ever asked to sign in to read, and nothing is behind a wall.
 *
 * Magic link, no passwords. Passwords would not have avoided the email
 * dependency - "forgot password" is an email - they would only have added
 * hashing, reset tokens and credential-stuffing defence on top of it.
 *
 * Sessions are JWTs, so there is no session table and no database round-trip to
 * read one. The usual cost of that is being unable to revoke a session;
 * `token_version` buys it back.
 */
import NextAuth, { type NextAuthConfig } from "next-auth";
import Resend from "next-auth/providers/resend";
import Passkey from "next-auth/providers/passkey";
import { cookies } from "next/headers";
import { SqliteAdapter, tokenVersion } from "@/server/auth-adapter";
import { claimAnonymousData } from "@/server/claim";
import { USER_COOKIE } from "@/lib/cookies";

/**
 * Registered only when configured, so a missing key is one fewer way to sign in
 * rather than a crash on boot. The app has run without any of this since it
 * existed and has to keep doing so.
 */
const providers: NextAuthConfig["providers"] = [];

if (process.env.AUTH_RESEND_KEY) {
  providers.push(
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      // Must be a domain VERIFIED in Resend. A subdomain is a separate domain
      // there and needs its own DNS records - sending from
      // login@1-percent-more-fluent.gtfoo.com while only gtfoo.com is verified
      // fails, and the only symptom is that no email ever arrives.
      from: process.env.AUTH_EMAIL_FROM ?? "login@gtfoo.com",
      name: "1 Percent More Fluent sign-in link",
      // Short-lived: a link that works all day is a link that works for whoever
      // reads the inbox tomorrow.
      maxAge: 15 * 60,
    }),
  );
}

/**
 * Passkeys, off unless asked for.
 *
 * Opt-in because WebAuthn is still experimental in Auth.js - it refuses to boot
 * without `experimental.enableWebAuthn` and warns on every start - and this is
 * an experimental feature inside a beta dependency. A flag means it can be
 * turned off without a deploy.
 *
 * A passkey is a convenience, not a replacement for the link. It lives on the
 * device, so it makes returning to a device you already use nearly instant; it
 * does not get you onto a NEW device, which is the thing accounts exist for
 * here. Email always works anywhere.
 */
const passkeysEnabled = Boolean(process.env.AUTH_PASSKEYS) && providers.length > 0;

if (passkeysEnabled) {
  providers.push(
    Passkey({
      /**
       * Refuse to mint an account from a passkey alone.
       *
       * The default returns `{ user: { email }, exists: false }` for an address
       * it has never seen, which registers a NEW account for it - with the
       * email unverified, because nothing was ever sent to it. That is an
       * account takeover waiting to happen: squat a passkey on someone's
       * address, wait for them to sign in by magic link, and Auth.js matches
       * them to the same row by email. Their account, your passkey.
       *
       * Returning null instead means registration is reachable only through the
       * session path in webauthn-options.ts, which skips getUserInfo entirely
       * when someone is already signed in. So a passkey can only ever be ADDED
       * by a reader who already proved the address is theirs by receiving a
       * link at it. Authenticating with an existing passkey stays open.
       */
      getUserInfo: async (options, request) => {
        const email =
          request.method === "POST"
            ? (request.body?.email as string | undefined)
            : (request.query?.email as string | undefined);
        if (!email) return null;
        const user = await options.adapter?.getUserByEmail?.(email);
        return user ? { user, exists: true } : null;
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: SqliteAdapter(),
  providers,
  experimental: { enableWebAuthn: passkeysEnabled },
  session: { strategy: "jwt" },
  pages: { signIn: "/signin", verifyRequest: "/signin/check-email" },
  /**
   * Take the reading history with you.
   *
   * An EVENT, not the signIn callback, and the difference is load-bearing. The
   * callback runs while Auth.js is deciding whether to allow the sign-in, and
   * for an address it has never seen the `user` it hands you is a placeholder -
   * `getUserByEmail() ?? { id: crypto.randomUUID(), ... }` - whose id is not in
   * the database yet. The row is created afterwards, by handleLoginOrRegister.
   *
   * So claiming from the callback silently did nothing on a FIRST sign-in,
   * while working perfectly on every later one: the claim refuses to move data
   * onto a user that does not exist, which is exactly the safety check that
   * turned a corruption bug into a no-op. The first sign-in is the one that
   * matters most, and it was the one losing everything.
   *
   * The event fires only after the account really exists. The send-the-link
   * step does not fire it at all - that path calls the signIn CALLBACK with
   * `email.verificationRequest` and no event - so there is no need to guard
   * against claiming on the strength of someone merely typing an address.
   */
  events: {
    async signIn({ user }) {
      if (!user?.id) return;
      try {
        const anonId = (await cookies()).get(USER_COOKIE)?.value;
        if (anonId) claimAnonymousData(anonId, user.id);
      } catch (err) {
        // Never break a sign-in over this. A failed merge leaves the reader
        // with an empty account and their history still sitting safely on the
        // cookie, which is recoverable; a failed sign-in is not.
        console.error("could not claim anonymous history", err);
      }
    },
  },

  callbacks: {
    /**
     * Carry the reader id and a token version in the JWT. The version is
     * compared against the database on every request, which is what makes
     * "sign out everywhere" possible without storing sessions: bumping the
     * column invalidates every token already issued.
     */
    async jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
        token.tv = tokenVersion(user.id) ?? 0;
        return token;
      }
      if (typeof token.uid === "string") {
        const tv = tokenVersion(token.uid);
        // Account deleted, or every session revoked.
        if (tv === null || tv !== token.tv) return null;
      }
      return token;
    },

    async session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
});

/**
 * Is signing in usable at all?
 *
 * Auth.js needs AUTH_SECRET even to READ a session, so calling auth() without
 * one throws MissingSecret on every render. Accounts are optional here, so no
 * secret means "no sign-in", not "broken app" - callers check this before
 * touching auth() rather than catching an exception.
 */
export function authConfigured(): boolean {
  return Boolean(process.env.AUTH_SECRET) && providers.length > 0;
}

/** Are passkeys on? Used to decide whether to offer them in the UI. */
export function passkeysConfigured(): boolean {
  return authConfigured() && passkeysEnabled;
}

/** Safe session read: null when auth is not configured, instead of throwing. */
export async function currentUser(): Promise<{ id: string; email: string } | null> {
  if (!authConfigured()) return null;
  try {
    const user = (await auth())?.user;
    if (!user?.id) return null;
    return { id: user.id, email: user.email ?? "" };
  } catch (err) {
    console.error("session read failed", err);
    return null;
  }
}
