#!/usr/bin/env bash
# Run ON the droplet. Sign in TWICE against the live site without sending any
# email, then delete everything it created.
#
# Twice is the point. A new address goes through the adapter's createUser; an
# address Auth.js already knows comes back through updateUser. Only the second
# path hit the `this` bug, which is why signing in on a phone worked and signing
# in on a laptop afterwards returned "There is a problem with the server
# configuration".
#
# Auth.js stores sha256(token + AUTH_SECRET), so a link cannot be read back out
# of the database - but it can be minted. Nothing here touches a real account.
set -eu
cd /home/deploy/1-percent-more-fluent || exit 1
export DATA_DIR=/home/deploy/1-percent-more-fluent/data
SITE=https://1-percent-more-fluent.gtfoo.com

npx tsx -e '
const { createHash, randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { getDb } = require("./src/server/db");

function secret() {
  const line = readFileSync("/home/deploy/1-percent-more-fluent/.env.local", "utf8")
    .split("\n").reverse().find((l) => /^\s*AUTH_SECRET=/.test(l));
  if (!line) throw new Error("no AUTH_SECRET");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["|\x27]|["|\x27]$/g, "");
}

(async () => {
  const db = getDb();
  const site = process.argv[1];
  const email = `fixture-${Date.now()}@example.com`;
  const S = secret();
  let bad = 0;
  const ok = (n, c, d) => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"} ${n}${d ? "  " + d : ""}`); };

  // One anonymous reader per "device", each with a piece of their own.
  function device(title) {
    const anon = randomUUID(), piece = randomUUID(), now = new Date().toISOString();
    db.prepare("INSERT INTO users (id, active_language, created_at) VALUES (?,?,?)").run(anon, "es", now);
    // A profile too. Without one the home page correctly renders the first-run
    // landing screen and lists nothing, so an assertion about the reading list
    // fails on a fixture gap rather than on anything real.
    db.prepare("INSERT INTO profiles (user_id,language,level,vocab_estimate,placed_at,updated_at) VALUES (?,?,?,NULL,NULL,?)")
      .run(anon, "es", 33, now);
    db.prepare("INSERT INTO pieces (id,user_id,language,format,topic,level,title,body,glossary,questions,report,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(piece, anon, "es", "story", "fixture", 33, title, "[]", "[]", "[]", "{}", now);
    return anon;
  }

  async function signIn(anon) {
    const token = randomUUID();
    db.prepare("INSERT INTO verification_tokens (identifier,token,expires) VALUES (?,?,?)")
      .run(email, createHash("sha256").update(token + S).digest("hex"),
           new Date(Date.now() + 9e5).toISOString());
    return fetch(`${site}/api/auth/callback/resend?token=${token}&email=${encodeURIComponent(email)}`,
      { headers: { cookie: `fluent_uid=${anon}` }, redirect: "manual" });
  }

  const a1 = device("ProdFirst");
  const r1 = await signIn(a1);
  ok("first sign-in redirects", r1.status === 302, "HTTP " + r1.status);
  ok("...not to an error", !/api\/auth\/error/.test(r1.headers.get("location") || ""),
     r1.headers.get("location") || "");

  const acct = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  ok("an account exists", Boolean(acct));

  // The one that used to fail.
  const a2 = device("ProdSecond");
  const r2 = await signIn(a2);
  const to2 = r2.headers.get("location") || "";
  ok("SECOND sign-in redirects", r2.status === 302, "HTTP " + r2.status);
  ok("...not to a configuration error", !/api\/auth\/error/.test(to2), to2);
  const sess = r2.headers.getSetCookie().map(c => c.split(";")[0])
    .find(c => c.startsWith("__Secure-authjs.session-token=") || c.startsWith("authjs.session-token="));
  ok("a session cookie is issued", Boolean(sess));

  if (acct) {
    const n = db.prepare("SELECT COUNT(*) n FROM pieces WHERE user_id = ?").get(acct.id).n;
    ok("both devices claimed onto one account", n === 2, String(n));
    ok("no duplicate account", db.prepare("SELECT COUNT(*) n FROM users WHERE email = ?").get(email).n === 1);
    if (sess) {
      const html = await (await fetch(site, { headers: { cookie: sess } })).text();
      ok("the signed-in page shows both", html.includes("ProdFirst") && html.includes("ProdSecond"));
    }
    db.transaction(() => {
      for (const t of ["lookups", "pieces", "profiles", "accounts"]) db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(acct.id);
      db.prepare("DELETE FROM users WHERE id = ?").run(acct.id);
    })();
  }
  for (const a of [a1, a2]) db.prepare("DELETE FROM users WHERE id = ?").run(a);
  db.prepare("DELETE FROM verification_tokens WHERE identifier = ?").run(email);
  ok("nothing left behind", !db.prepare("SELECT 1 FROM users WHERE email = ?").get(email));

  console.log(bad ? `\n${bad} failing` : "\nboth sign-ins work on the live site");
  process.exit(bad ? 1 : 0);
})();
' "$SITE"
