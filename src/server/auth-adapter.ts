/**
 * A deliberately partial Auth.js adapter over this app's SQLite database.
 *
 * With the JWT session strategy Auth.js never calls the session methods -
 * createSession, getSessionAndUser, updateSession, deleteSession - so they are
 * omitted rather than stubbed. Dead code that silently does nothing is worse
 * than absent code: it looks like a session store and is not one.
 *
 * Magic-link login needs the verification-token pair plus enough user methods
 * to find or create an account for an email address.
 *
 * `users` here is the app's OWN table, the one anonymous cookie readers already
 * live in. A row created by this adapter is the same kind of row as one created
 * by getOrCreateUserId - it just happens to have an email on it. That is what
 * makes signing in a claim rather than a fresh start; see claim.ts.
 */
import { randomUUID } from "node:crypto";
import type { Adapter, AdapterUser, VerificationToken } from "next-auth/adapters";
import { getDb } from "./db";

export function SqliteAdapter(): Adapter {
  return {
    async createUser(user) {
      const id = randomUUID();
      getDb()
        .prepare(
          `INSERT INTO users (id, email, name, image, email_verified, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          user.email ?? null,
          user.name ?? null,
          user.image ?? null,
          user.emailVerified ? user.emailVerified.toISOString() : null,
          new Date().toISOString(),
        );
      return { ...user, id } as AdapterUser;
    },

    async getUser(id) {
      return toUser(getDb().prepare("SELECT * FROM users WHERE id = ?").get(id));
    },

    async getUserByEmail(email) {
      return toUser(getDb().prepare("SELECT * FROM users WHERE email = ?").get(email));
    },

    async getUserByAccount({ provider, providerAccountId }) {
      return toUser(
        getDb()
          .prepare(
            `SELECT u.* FROM users u
               JOIN accounts a ON a.user_id = u.id
              WHERE a.provider = ? AND a.provider_account_id = ?`,
          )
          .get(provider, providerAccountId),
      );
    },

    async updateUser(user) {
      getDb()
        .prepare(
          `UPDATE users
              SET name           = COALESCE(?, name),
                  email          = COALESCE(?, email),
                  image          = COALESCE(?, image),
                  email_verified = COALESCE(?, email_verified)
            WHERE id = ?`,
        )
        .run(
          user.name ?? null,
          user.email ?? null,
          user.image ?? null,
          user.emailVerified ? user.emailVerified.toISOString() : null,
          user.id,
        );
      return (await this.getUser!(user.id!)) as AdapterUser;
    },

    async deleteUser(id) {
      // Everything keyed to this reader goes with them. The FK on accounts
      // cascades; the rest is explicit because the app's own tables predate
      // accounts and carry no foreign keys.
      const db = getDb();
      db.transaction(() => {
        db.prepare("DELETE FROM lookups WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM pieces WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM profiles WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM accounts WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM users WHERE id = ?").run(id);
      })();
    },

    /**
     * Only identity is recorded - no access token, no refresh token, no scope.
     * The app never acts on a reader's behalf at a provider, so storing a
     * credential would be liability without purpose.
     */
    async linkAccount(account) {
      getDb()
        .prepare(
          `INSERT OR IGNORE INTO accounts (user_id, provider, provider_account_id, type)
           VALUES (?, ?, ?, ?)`,
        )
        .run(account.userId, account.provider, account.providerAccountId, account.type);
      return undefined;
    },

    async unlinkAccount({ provider, providerAccountId }) {
      getDb()
        .prepare("DELETE FROM accounts WHERE provider = ? AND provider_account_id = ?")
        .run(provider, providerAccountId);
    },

    async createVerificationToken(token) {
      getDb()
        .prepare(
          "INSERT INTO verification_tokens (identifier, token, expires) VALUES (?, ?, ?)",
        )
        .run(token.identifier, token.token, token.expires.toISOString());
      return token;
    },

    /**
     * Single use: the row is deleted as it is read, inside a transaction, so a
     * magic link cannot be replayed even if the email is forwarded or the URL
     * ends up in a proxy log. Expiry is checked by the caller; the row is
     * consumed either way, so a stale link cannot be retried.
     */
    async useVerificationToken({ identifier, token }) {
      const db = getDb();
      const consume = db.transaction(() => {
        const row = db
          .prepare(
            `SELECT identifier, token, expires FROM verification_tokens
              WHERE identifier = ? AND token = ?`,
          )
          .get(identifier, token) as
          | { identifier: string; token: string; expires: string }
          | undefined;
        if (!row) return null;
        db.prepare(
          "DELETE FROM verification_tokens WHERE identifier = ? AND token = ?",
        ).run(identifier, token);
        return {
          identifier: row.identifier,
          token: row.token,
          expires: new Date(row.expires),
        } satisfies VerificationToken;
      });
      return consume();
    },
  };
}

interface Row {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  email_verified: string | null;
}

function toUser(row: unknown): AdapterUser | null {
  const r = row as Row | undefined;
  if (!r) return null;
  return {
    id: r.id,
    email: r.email ?? "",
    name: r.name,
    image: r.image,
    emailVerified: r.email_verified ? new Date(r.email_verified) : null,
  };
}

/** The token version stored against a reader, for JWT revocation. */
export function tokenVersion(id: string): number | null {
  const row = getDb()
    .prepare("SELECT token_version FROM users WHERE id = ?")
    .get(id) as { token_version: number } | undefined;
  return row ? row.token_version : null;
}
