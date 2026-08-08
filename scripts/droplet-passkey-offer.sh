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

    // With one registered the section must STAY. A phone and a laptop are
    // different credentials, and a passkey on a machine you no longer have
    // needs revoking - the first version hid itself here, which made both
    // impossible.
    if (acct) {
      db.prepare(`INSERT INTO authenticators
        (credential_id,user_id,provider_account_id,credential_public_key,counter,
         credential_device_type,credential_backed_up,transports,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run("fixture-cred", acct.id, "fixture-acct", "k", 0, "multiDevice", 1, null, now);
      const after = rendered(await (await fetch(site, { headers: { cookie: sess } })).text());
      ok("the registered passkey is listed", /Synced passkey|Clave sincronizada/.test(after),
         after.match(/(Synced passkey|Clave sincronizada)[^<]{0,30}/)?.[0] || "not listed");
      ok("...with a way to revoke it", /Remove|Quitar/.test(after));
      ok("...and a way to add another device", /Add a passkey|Añadir una clave/.test(after));
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
