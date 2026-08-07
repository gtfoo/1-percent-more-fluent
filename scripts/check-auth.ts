/**
 * Assert that signing in claims what you read anonymously, and that the app is
 * untouched when auth is not configured.
 *
 *   npm run auth
 *
 * No network, no email, no LLM. The claim is pure SQLite, and "unconfigured"
 * is the state this app has been in since it existed - the property that must
 * not break is that it keeps working exactly as before.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const pass = a === e;
  if (!pass) failures++;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}`);
  if (!pass) console.log(`       expected ${e}\n       got      ${a}`);
}

function ok(name: string, condition: boolean, detail = "") {
  if (!condition) failures++;
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

async function main() {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "fluent-auth-"));
  process.env.AUDIO_DIR = join(process.env.DATA_DIR, "audio");
  // Explicitly absent: this is the state the app ships in today.
  delete process.env.AUTH_SECRET;
  delete process.env.AUTH_RESEND_KEY;

  const { getDb } = await import("../src/server/db");
  const { claimAnonymousData } = await import("../src/server/claim");
  const { authConfigured, currentUser } = await import("../src/auth");

  const db = getDb();

  const user = (id: string, email: string | null = null, active: string | null = null) =>
    db
      .prepare(
        "INSERT INTO users (id, email, active_language, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(id, email, active, new Date().toISOString());

  const profile = (uid: string, lang: string, level: number, updated: string) =>
    db
      .prepare(
        `INSERT INTO profiles (user_id, language, level, vocab_estimate, placed_at, updated_at)
         VALUES (?, ?, ?, NULL, NULL, ?)`,
      )
      .run(uid, lang, level, updated);

  const piece = (id: string, uid: string, lang: string) =>
    db
      .prepare(
        `INSERT INTO pieces (id, user_id, language, format, topic, level, title, body,
                             glossary, questions, report, created_at)
         VALUES (?, ?, ?, 'story', 't', 30, 'T', '[]', '[]', '[]', '{}', ?)`,
      )
      .run(id, uid, lang, new Date().toISOString());

  const lookup = (uid: string, pieceId: string, word: string) =>
    db
      .prepare(
        "INSERT INTO lookups (user_id, piece_id, word, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(uid, pieceId, word, new Date().toISOString());

  const countFor = (table: string, uid: string) =>
    (db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE user_id = ?`).get(uid) as { n: number })
      .n;

  console.log("--- the app works with no auth configured ---");
  // The property that matters most. Every reader today is in this state, and
  // auth.js throws MissingSecret if you so much as read a session without a
  // secret - so the guard, not a try/catch at each call site, is what keeps
  // the app alive.
  ok("authConfigured() is false", !authConfigured());
  check("currentUser() is null rather than throwing", await currentUser(), null);

  console.log("\n--- first sign-in: the account inherits everything ---");
  {
    user("anon1", null, "zh-CN");
    user("acct1", "reader@example.com");
    profile("anon1", "zh-CN", 62, "2026-08-01T00:00:00Z");
    piece("p1", "anon1", "zh-CN");
    piece("p2", "anon1", "zh-CN");
    lookup("anon1", "p1", "钥匙");
    lookup("anon1", "p2", "口袋");

    const r = claimAnonymousData("anon1", "acct1");
    check("it claimed", r.claimed, true);
    check("both pieces moved", r.pieces, 2);
    check("both lookups moved", r.lookups, 2);
    check("the profile moved", r.profiles, 1);
    check("nothing was contested", r.contested, []);
    check("the account has the pieces", countFor("pieces", "acct1"), 2);
    check("the account has the lookups", countFor("lookups", "acct1"), 2);
    check("the account has the level", countFor("profiles", "acct1"), 1);
    ok(
      "the anonymous reader is gone",
      !db.prepare("SELECT 1 FROM users WHERE id = 'anon1'").get(),
    );
    check(
      "the language they were reading carries over",
      (db.prepare("SELECT active_language a FROM users WHERE id = 'acct1'").get() as {
        a: string | null;
      }).a,
      "zh-CN",
    );
  }

  console.log("\n--- second device: newest level wins ---");
  {
    // The account was left at 30 a while ago; this browser has been read in
    // since and sits at 71. The recent one is the better evidence of what this
    // person can read today, which is why it is newest rather than highest.
    user("anon2");
    user("acct2", "two@example.com");
    profile("acct2", "es", 30, "2026-06-01T00:00:00Z");
    profile("anon2", "es", 71, "2026-08-05T00:00:00Z");

    const r = claimAnonymousData("anon2", "acct2");
    check("the language was contested", r.contested, ["es"]);
    check("exactly one profile remains", countFor("profiles", "acct2"), 1);
    check(
      "and it is the newer level",
      (db.prepare("SELECT level l FROM profiles WHERE user_id = 'acct2'").get() as {
        l: number;
      }).l,
      71,
    );
  }

  console.log("\n--- ...and the account keeps its own when IT is newer ---");
  {
    // The mirror case. A stale cookie on a borrowed laptop must not overwrite a
    // level built on the device actually being used.
    user("anon3");
    user("acct3", "three@example.com");
    profile("acct3", "es", 68, "2026-08-06T00:00:00Z");
    profile("anon3", "es", 12, "2026-05-01T00:00:00Z");

    claimAnonymousData("anon3", "acct3");
    check("one profile", countFor("profiles", "acct3"), 1);
    check(
      "the account's own level survived",
      (db.prepare("SELECT level l FROM profiles WHERE user_id = 'acct3'").get() as {
        l: number;
      }).l,
      68,
    );
    ok(
      "the stale one is not left behind",
      !db.prepare("SELECT 1 FROM profiles WHERE user_id = 'anon3'").get(),
    );
  }

  console.log("\n--- languages combine rather than collide ---");
  {
    user("anon4");
    user("acct4", "four@example.com");
    profile("acct4", "es", 40, "2026-08-01T00:00:00Z");
    profile("anon4", "zh-CN", 20, "2026-08-02T00:00:00Z");

    claimAnonymousData("anon4", "acct4");
    check("both languages survive", countFor("profiles", "acct4"), 2);
    check(
      "in one account",
      (db
        .prepare(
          "SELECT GROUP_CONCAT(language) g FROM (SELECT language FROM profiles WHERE user_id = 'acct4' ORDER BY language)",
        )
        .get() as { g: string }).g,
      "es,zh-CN",
    );
  }

  console.log("\n--- what it refuses to do ---");
  {
    // The one mistake here that destroys data belonging to somebody who is not
    // present: merging a real account into another because a browser happened
    // to be carrying its cookie.
    user("acctA", "a@example.com");
    user("acctB", "b@example.com");
    piece("pA", "acctA", "es");

    const r = claimAnonymousData("acctA", "acctB");
    check("it will not claim an account that has an email", r.claimed, false);
    check("...and moves nothing", countFor("pieces", "acctA"), 1);
    ok(
      "...and leaves it existing",
      Boolean(db.prepare("SELECT 1 FROM users WHERE id = 'acctA'").get()),
    );

    check("claiming yourself is a no-op", claimAnonymousData("acctB", "acctB").claimed, false);
    check("an unknown source is a no-op", claimAnonymousData("ghost", "acctB").claimed, false);
    check("an unknown target is a no-op", claimAnonymousData("acctB", "ghost").claimed, false);
    check("empty ids are a no-op", claimAnonymousData("", "").claimed, false);
  }

  console.log("\n--- the anonymous path still stands alone ---");
  {
    // Nobody signs in. This is every reader today, and it has to keep working.
    user("anon9", null, "es");
    profile("anon9", "es", 55, "2026-08-01T00:00:00Z");
    piece("p9", "anon9", "es");
    check("their profile is theirs", countFor("profiles", "anon9"), 1);
    check("their piece is theirs", countFor("pieces", "anon9"), 1);
  }

  console.log(failures ? `\n${failures} failing` : "\nsigning in claims what you read");
  process.exit(failures ? 1 : 0);
}

void main();
