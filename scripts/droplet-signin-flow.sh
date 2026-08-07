#!/usr/bin/env bash
# Run ON the droplet. Sign in against the live site without sending an email,
# then delete everything it created.
#
# Same trick as scripts/check-signin-flow.ts: Auth.js stores
# sha256(token + AUTH_SECRET), so a link cannot be read out of the database but
# it can be minted. This proves the deployed configuration works end to end -
# everything except Resend actually delivering, which needs a real inbox.
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
  let bad = 0;
  const ok = (n, c, d) => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"} ${n}${d ? "  " + d : ""}`); };

  const anon = randomUUID(), piece = randomUUID(), now = new Date().toISOString();
  db.prepare("INSERT INTO users (id, active_language, created_at) VALUES (?,?,?)").run(anon, "es", now);
  db.prepare("INSERT INTO profiles (user_id,language,level,vocab_estimate,placed_at,updated_at) VALUES (?,?,?,NULL,NULL,?)").run(anon, "es", 33, now);
  db.prepare("INSERT INTO pieces (id,user_id,language,format,topic,level,title,body,glossary,questions,report,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(piece, anon, "es", "story", "fixture", 33, "ProdFixture", "[]", "[]", "[]", "{}", now);
  db.prepare("INSERT INTO lookups (user_id,piece_id,word,created_at) VALUES (?,?,?,?)").run(anon, piece, "telaraña", now);

  const token = randomUUID();
  db.prepare("INSERT INTO verification_tokens (identifier,token,expires) VALUES (?,?,?)")
    .run(email, createHash("sha256").update(token + secret()).digest("hex"),
         new Date(Date.now() + 9e5).toISOString());

  const res = await fetch(`${site}/api/auth/callback/resend?token=${token}&email=${encodeURIComponent(email)}`,
    { headers: { cookie: `fluent_uid=${anon}` }, redirect: "manual" });
  ok("the callback redirects", res.status === 302, "HTTP " + res.status);
  const session = res.headers.getSetCookie().map(c => c.split(";")[0])
    .find(c => c.startsWith("__Secure-authjs.session-token=") || c.startsWith("authjs.session-token="));
  ok("a session cookie is issued", Boolean(session),
     res.headers.getSetCookie().map(c => c.split("=")[0]).join(", "));

  const acct = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  ok("an account was created", Boolean(acct));
  if (acct) {
    const n = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE user_id = ?`).get(acct.id).n;
    ok("the piece was claimed", n("pieces") === 1, String(n("pieces")));
    ok("the lookup was claimed", n("lookups") === 1, String(n("lookups")));
    ok("the level was claimed", n("profiles") === 1, String(n("profiles")));
    ok("the anonymous reader is gone", !db.prepare("SELECT 1 FROM users WHERE id=?").get(anon));

    if (session) {
      const html = await (await fetch(site, { headers: { cookie: session } })).text();
      ok("the signed-in home page shows their piece", html.includes("ProdFixture"));
    }

    db.transaction(() => {
      for (const t of ["lookups", "pieces", "profiles", "accounts"]) db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(acct.id);
      db.prepare("DELETE FROM users WHERE id = ?").run(acct.id);
    })();
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(anon);
  db.prepare("DELETE FROM verification_tokens WHERE identifier = ?").run(email);
  ok("nothing was left behind",
     !db.prepare("SELECT 1 FROM users WHERE email = ?").get(email) &&
     !db.prepare("SELECT 1 FROM users WHERE id = ?").get(anon));

  console.log(bad ? `\n${bad} failing` : "\nlive sign-in works end to end");
  process.exit(bad ? 1 : 0);
})();
' "$SITE"
