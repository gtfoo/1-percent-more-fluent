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

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: SqliteAdapter(),
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin", verifyRequest: "/signin/check-email" },
  callbacks: {
    /**
     * Take the reading history with you.
     *
     * This runs once the link has actually been followed, at which point there
     * is both a signed-in account and, usually, a cookie identity in the same
     * browser holding everything read so far. See claim.ts.
     */
    async signIn({ user, email }) {
      // The email provider calls this TWICE: once to ask for the link to be
      // sent, and again when it is followed. Only the second is a sign-in, and
      // claiming on the first would move a reader's history on the say-so of
      // anyone who could type their address.
      if (email?.verificationRequest) return true;
      if (!user?.id) return true;

      try {
        const anonId = (await cookies()).get(USER_COOKIE)?.value;
        if (anonId) claimAnonymousData(anonId, user.id);
      } catch (err) {
        // Never block a sign-in over this. Failing to merge leaves the reader
        // with an empty account and their history still safe on the cookie,
        // which is recoverable; refusing the sign-in is not.
        console.error("could not claim anonymous history", err);
      }
      return true;
    },

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
