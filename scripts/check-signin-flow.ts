/**
 * Sign in for real, without sending an email.
 *
 *   bash scripts/dev.sh && npx tsx scripts/check-signin-flow.ts
 *
 * Auth.js stores a HASH of the magic-link token, not the token, so a link
 * cannot be reconstructed from the database - which is the whole point of
 * storing it that way. What it can do is mint one: the hash is
 * sha256(token + AUTH_SECRET), so this writes a token it already knows and then
 * follows the callback the email would have contained.
 *
 * That exercises everything the real link does - token consumption, account
 * creation, the claim, the session cookie - while sending nothing to anybody.
 * The one step it does NOT cover is Resend actually delivering, which needs a
 * real inbox and belongs to a person, not a script.
 *
 * Everything it creates, it deletes.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = "http://127.0.0.1:3003";
const EMAIL = `fixture-${Date.now()}@example.com`;

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

/** AUTH_SECRET as the running server sees it. Quotes stripped, never printed. */
function readSecret(): string {
  const line = readFileSync(".env.local", "utf8")
    .split("\n")
    .reverse()
    .find((l) => /^\s*AUTH_SECRET=/.test(l));
  if (!line) throw new Error("no AUTH_SECRET in .env.local");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const { getDb } = await import("../src/server/db");
  const db = getDb();
  const secret = readSecret();

  if (!(await fetch(BASE).then((r) => r.ok).catch(() => false))) {
    console.error("no dev server on 3003 - run: bash scripts/dev.sh");
    process.exit(1);
  }

  // A reader who has been using the app anonymously, exactly like everyone
  // currently in production.
  const anonId = randomUUID();
  const pieceId = randomUUID();
  db.prepare("INSERT INTO users (id, active_language, created_at) VALUES (?, ?, ?)").run(
    anonId,
    "es",
    new Date().toISOString(),
  );
  db.prepare(
    `INSERT INTO profiles (user_id, language, level, vocab_estimate, placed_at, updated_at)
     VALUES (?, 'es', 47, NULL, NULL, ?)`,
  ).run(anonId, new Date().toISOString());
  db.prepare(
    `INSERT INTO pieces (id, user_id, language, format, topic, level, title, body,
                         glossary, questions, report, created_at)
     VALUES (?, ?, 'es', 'story', 'fixture', 47, 'Fixture', '[]', '[]', '[]', '{}', ?)`,
  ).run(pieceId, anonId, new Date().toISOString());
  for (const word of ["telaraña", "butaca"]) {
    db.prepare(
      "INSERT INTO lookups (user_id, piece_id, word, created_at) VALUES (?, ?, ?, ?)",
    ).run(anonId, pieceId, word, new Date().toISOString());
  }

  // The token the email would have carried.
  const token = randomUUID();
  db.prepare(
    "INSERT INTO verification_tokens (identifier, token, expires) VALUES (?, ?, ?)",
  ).run(
    EMAIL,
    createHash("sha256").update(`${token}${secret}`).digest("hex"),
    new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  );

  console.log("--- following the link ---");
  const url = `${BASE}/api/auth/callback/resend?token=${token}&email=${encodeURIComponent(EMAIL)}`;
  const res = await fetch(url, {
    headers: { cookie: `fluent_uid=${anonId}` },
    redirect: "manual",
  });

  ok("the callback redirects rather than erroring", res.status === 302, `HTTP ${res.status}`);
  const session = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .find((c) => c.startsWith("authjs.session-token="));
  ok(
    "a session cookie is issued",
    Boolean(session),
    // The names only. Printing the first 60 characters of everything Set-Cookie
    // showed the csrf token next to an assertion about the session token, which
    // reads like the assertion passed on the wrong thing.
    res.headers
      .getSetCookie()
      .map((c) => c.split("=")[0])
      .join(", "),
  );

  console.log("\n--- the token is spent ---");
  check(
    "it cannot be used twice",
    db
      .prepare("SELECT COUNT(*) n FROM verification_tokens WHERE identifier = ?")
      .get(EMAIL),
    { n: 0 },
  );
  const replay = await fetch(url, { redirect: "manual" });
  ok(
    "replaying the same link fails",
    replay.status !== 302 || /error/i.test(replay.headers.get("location") ?? ""),
    `HTTP ${replay.status} -> ${replay.headers.get("location") ?? ""}`,
  );

  console.log("\n--- the account exists, and inherited everything ---");
  const account = db.prepare("SELECT id FROM users WHERE email = ?").get(EMAIL) as
    | { id: string }
    | undefined;
  ok("an account was created for the address", Boolean(account));
  if (!account) {
    console.log("\ncannot continue without an account");
    process.exit(1);
  }

  const n = (table: string, id: string) =>
    (db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE user_id = ?`).get(id) as { n: number })
      .n;

  check("the piece moved to it", n("pieces", account.id), 1);
  check("both lookups moved", n("lookups", account.id), 2);
  check("the level moved", n("profiles", account.id), 1);
  check(
    "and it is the level they had",
    (db.prepare("SELECT level l FROM profiles WHERE user_id = ?").get(account.id) as {
      l: number;
    }).l,
    47,
  );
  check(
    "the language they were reading carried over",
    (db.prepare("SELECT active_language a FROM users WHERE id = ?").get(account.id) as {
      a: string | null;
    }).a,
    "es",
  );
  ok(
    "the anonymous reader is gone",
    !db.prepare("SELECT 1 FROM users WHERE id = ?").get(anonId),
  );

  console.log("\n--- and the signed-in browser sees it ---");
  if (session) {
    // No fluent_uid at all: this is the second-device case, where the only
    // thing identifying the reader is the session.
    const home = await fetch(BASE, { headers: { cookie: session } });
    const html = await home.text();
    ok("the home page renders", home.ok, `HTTP ${home.status}`);
    ok("their piece is listed", html.includes("Fixture"));
    const words = await fetch(`${BASE}/words`, { headers: { cookie: session } });
    const wordsHtml = await words.text();
    ok("their words are listed", wordsHtml.includes("telaraña"));
    const header = wordsHtml.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    ok("the header offers sign-out, not sign-in", /Cerrar sesión|Sign out/.test(header), header.slice(0, 0));
    ok("...and not sign-in", !/href="\/signin"/.test(header));
  } else {
    failures++;
    console.log("FAIL no session cookie to continue with");
  }

  // --- Signing in AGAIN, with the same address ---------------------------
  //
  // This is the case every earlier version of this script missed. It minted a
  // brand-new address each run, so Auth.js only ever took the createUser path;
  // an address it already knows comes back through updateUser instead. That
  // method ended with `this.getUser(...)`, and Auth.js does not call adapter
  // methods with the adapter as receiver, so `this` was undefined and it threw
  // - reaching the reader as "There is a problem with the server
  // configuration".
  //
  // It looked like a device problem: sign in on a phone, fine; sign in on a
  // laptop afterwards, broken. It was simply first sign-in versus second.
  console.log("\n--- signing in again, as a second device would ---");
  {
    const anon2 = randomUUID();
    const piece2 = randomUUID();
    db.prepare("INSERT INTO users (id, active_language, created_at) VALUES (?, ?, ?)").run(
      anon2,
      "es",
      new Date().toISOString(),
    );
    db.prepare(
      `INSERT INTO pieces (id, user_id, language, format, topic, level, title, body,
                           glossary, questions, report, created_at)
       VALUES (?, ?, 'es', 'story', 'fixture', 47, 'SecondDevice', '[]', '[]', '[]', '{}', ?)`,
    ).run(piece2, anon2, new Date().toISOString());

    const token2 = randomUUID();
    db.prepare(
      "INSERT INTO verification_tokens (identifier, token, expires) VALUES (?, ?, ?)",
    ).run(
      EMAIL,
      createHash("sha256").update(`${token2}${secret}`).digest("hex"),
      new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    );

    const res2 = await fetch(
      `${BASE}/api/auth/callback/resend?token=${token2}&email=${encodeURIComponent(EMAIL)}`,
      { headers: { cookie: `fluent_uid=${anon2}` }, redirect: "manual" },
    );
    const to = res2.headers.get("location") ?? "";
    ok("the second sign-in redirects", res2.status === 302, `HTTP ${res2.status}`);
    ok("...and not to an error page", !/\/api\/auth\/error/.test(to), to);
    ok(
      "a session cookie is issued again",
      res2.headers.getSetCookie().some((c) => c.startsWith("authjs.session-token=")),
    );

    check(
      "no second account was created for the same address",
      (db.prepare("SELECT COUNT(*) n FROM users WHERE email = ?").get(EMAIL) as { n: number })
        .n,
      1,
    );
    check(
      "the second device's reading was claimed too",
      (db.prepare("SELECT COUNT(*) n FROM pieces WHERE user_id = ?").get(account.id) as {
        n: number;
      }).n,
      2,
    );
    ok(
      "the second anonymous reader is gone",
      !db.prepare("SELECT 1 FROM users WHERE id = ?").get(anon2),
    );
  }

  console.log("\n--- cleaning up ---");
  db.transaction(() => {
    db.prepare("DELETE FROM lookups WHERE user_id = ?").run(account.id);
    db.prepare("DELETE FROM pieces WHERE user_id = ?").run(account.id);
    db.prepare("DELETE FROM profiles WHERE user_id = ?").run(account.id);
    db.prepare("DELETE FROM accounts WHERE user_id = ?").run(account.id);
    db.prepare("DELETE FROM users WHERE id = ?").run(account.id);
    db.prepare("DELETE FROM verification_tokens WHERE identifier = ?").run(EMAIL);
  })();
  check(
    "the fixture account is gone",
    db.prepare("SELECT COUNT(*) n FROM users WHERE email = ?").get(EMAIL),
    { n: 0 },
  );

  console.log(failures ? `\n${failures} failing` : "\nsigning in works end to end");
  process.exit(failures ? 1 : 0);
}

void main();
