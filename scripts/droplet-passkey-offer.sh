#!/usr/bin/env bash
# Run ON the droplet. Does a signed-in reader actually get offered a passkey?
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
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["|\x27]|["|\x27]$/g, "");
}
// Everything handed to a client component is serialised into the page inside
// <script> tags, so the raw HTML contains every string whether rendered or not.
const rendered = (h) => h.replace(/<script\b[\s\S]*?<\/script>/g, "");

(async () => {
  const db = getDb(), site = process.argv[1], S = secret();
  const email = `fixture-${Date.now()}@example.com`;
  let bad = 0;
  const ok = (n, c, d) => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"} ${n}${d ? "  " + d : ""}`); };

  const anon = randomUUID(), now = new Date().toISOString();
  db.prepare("INSERT INTO users (id, active_language, created_at) VALUES (?,?,?)").run(anon, "es", now);
  db.prepare("INSERT INTO profiles (user_id,language,level,vocab_estimate,placed_at,updated_at) VALUES (?,?,?,NULL,NULL,?)")
    .run(anon, "es", 33, now);

  const token = randomUUID();
  db.prepare("INSERT INTO verification_tokens (identifier,token,expires) VALUES (?,?,?)")
    .run(email, createHash("sha256").update(token + S).digest("hex"),
         new Date(Date.now() + 9e5).toISOString());
  const res = await fetch(`${site}/api/auth/callback/resend?token=${token}&email=${encodeURIComponent(email)}`,
    { headers: { cookie: `fluent_uid=${anon}` }, redirect: "manual" });
  const sess = res.headers.getSetCookie().map(c => c.split(";")[0])
    .find(c => c.startsWith("__Secure-authjs.session-token=") || c.startsWith("authjs.session-token="));
  ok("signed in", Boolean(sess));

  const acct = db.prepare("SELECT id FROM users WHERE email = ?").get(email);

  if (sess) {
    const html = rendered(await (await fetch(site, { headers: { cookie: sess } })).text());
    ok("the home page offers a passkey", /Add a passkey/.test(html),
       html.match(/passkey[^<]{0,40}/i)?.[0] || "no mention of a passkey anywhere");
    ok("...and offers sign-out, so we really are signed in", /Sign out|Cerrar sesión/.test(html));

    // Once one is registered the offer should stop - but then there is no way
    // to add a second device, or to see what is registered.
    if (acct) {
      db.prepare(`INSERT INTO authenticators
        (credential_id,user_id,provider_account_id,credential_public_key,counter,
         credential_device_type,credential_backed_up,transports,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run("fixture-cred", acct.id, "fixture-acct", "k", 0, "multiDevice", 1, null, now);
      const after = rendered(await (await fetch(site, { headers: { cookie: sess } })).text());
      ok("with one registered, the offer is gone", !/Add a passkey/.test(after));
      ok("...and nothing replaces it", !/passkey/i.test(after),
         after.match(/passkey[^<]{0,40}/i)?.[0] || "(nothing about passkeys at all)");
    }
  }

  if (acct) {
    db.transaction(() => {
      for (const t of ["authenticators","lookups","pieces","profiles","accounts"])
        db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(acct.id);
      db.prepare("DELETE FROM users WHERE id = ?").run(acct.id);
    })();
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(anon);
  db.prepare("DELETE FROM verification_tokens WHERE identifier = ?").run(email);
  console.log(bad ? `\n${bad} failing` : "\nthe offer behaves as built");
  process.exit(bad ? 1 : 0);
})();
' "$SITE"
