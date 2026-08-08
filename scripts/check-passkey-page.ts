/**
 * Assert the passkey settings live in the header, not in the reading flow.
 *
 *   bash scripts/dev.sh && npx tsx scripts/check-passkey-page.ts
 *
 * Signs in for real without sending an email, using the same minted-token trick
 * as check-signin-flow.ts: Auth.js stores sha256(token + AUTH_SECRET), so a link
 * cannot be read back out of the database but it can be written in.
 *
 * Everything it creates, it deletes.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = "http://127.0.0.1:3003";
const EMAIL = `fixture-${Date.now()}@example.com`;

let failures = 0;

function ok(name: string, condition: boolean, detail = "") {
  if (!condition) failures++;
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

/** Everything handed to a client component is serialised into the page inside
 *  <script> tags, so the raw HTML contains strings that never rendered. */
const rendered = (html: string) => html.replace(/<script\b[\s\S]*?<\/script>/g, "");
const header = (html: string) => rendered(html).match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";

function secret(): string {
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

  if (!(await fetch(BASE).then((r) => r.ok).catch(() => false))) {
    console.error("no dev server on 3003 - run: bash scripts/dev.sh");
    process.exit(1);
  }

  const providers = (await (await fetch(`${BASE}/api/auth/providers`)).json()) as Record<
    string,
    unknown
  >;
  if (!("passkey" in providers)) {
    console.error("passkeys are not configured here - set AUTH_PASSKEYS=1 in .env.local");
    process.exit(1);
  }

  console.log("--- signed out ---");
  {
    const res = await fetch(`${BASE}/passkeys`, { redirect: "manual" });
    ok("/passkeys is not reachable", res.status === 307 || res.status === 302, `HTTP ${res.status}`);
    const home = await (await fetch(BASE)).text();
    ok("the header does not offer it", !/href="\/passkeys"/.test(header(home)));
  }

  // Sign in, with a profile so the home page renders the placed layout.
  const anon = randomUUID();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users (id, active_language, created_at) VALUES (?,?,?)").run(
    anon,
    "es",
    now,
  );
  db.prepare(
    `INSERT INTO profiles (user_id,language,level,vocab_estimate,placed_at,updated_at)
     VALUES (?,?,?,NULL,NULL,?)`,
  ).run(anon, "es", 30, now);

  const token = randomUUID();
  db.prepare("INSERT INTO verification_tokens (identifier,token,expires) VALUES (?,?,?)").run(
    EMAIL,
    createHash("sha256").update(`${token}${secret()}`).digest("hex"),
    new Date(Date.now() + 9e5).toISOString(),
  );
  const res = await fetch(
    `${BASE}/api/auth/callback/resend?token=${token}&email=${encodeURIComponent(EMAIL)}`,
    { headers: { cookie: `fluent_uid=${anon}` }, redirect: "manual" },
  );
  const session = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .find((c) => c.startsWith("authjs.session-token="));

  console.log("\n--- signed in ---");
  ok("signed in", Boolean(session));
  const account = db.prepare("SELECT id FROM users WHERE email = ?").get(EMAIL) as
    | { id: string }
    | undefined;

  if (session && account) {
    const home = await (await fetch(BASE, { headers: { cookie: session } })).text();
    ok("the header offers it", /href="\/passkeys"/.test(header(home)));
    // The point of the move: it is no longer between the level and the words.
    ok(
      "the home page no longer carries the card",
      !/Add a passkey|Añadir una clave/.test(rendered(home)),
      rendered(home).match(/[^<>]*passkey[^<>]*/i)?.[0]?.trim() ?? "",
    );
    ok("...and still shows what it is for", /Compose|Qué|What do you/.test(rendered(home)));

    const page = await fetch(`${BASE}/passkeys`, { headers: { cookie: session } });
    const body = rendered(await page.text());
    ok("the page renders", page.ok, `HTTP ${page.status}`);
    ok("...with the heading", /Signing in without email|Entrar sin correo/.test(body));
    ok("...and a way to add one", /Add a passkey|Añadir una clave/.test(body));

    // With one registered it must list and offer to revoke it.
    db.prepare(
      `INSERT INTO authenticators
         (credential_id,user_id,provider_account_id,credential_public_key,counter,
          credential_device_type,credential_backed_up,transports,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run("fixture-cred", account.id, "fixture-acct", "k", 0, "multiDevice", 1, null, now);
    const withOne = rendered(
      await (await fetch(`${BASE}/passkeys`, { headers: { cookie: session } })).text(),
    );
    ok("a registered passkey is listed", /Synced passkey|Clave sincronizada/.test(withOne));
    ok("...with a way to revoke it", /Remove|Quitar/.test(withOne));
    ok("...and still a way to add another", /Add a passkey|Añadir una clave/.test(withOne));
  }

  console.log("\n--- cleaning up ---");
  if (account) {
    db.transaction(() => {
      for (const t of ["authenticators", "lookups", "pieces", "profiles", "accounts"]) {
        db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(account.id);
      }
      db.prepare("DELETE FROM users WHERE id = ?").run(account.id);
    })();
  }
  db.prepare("DELETE FROM profiles WHERE user_id = ?").run(anon);
  db.prepare("DELETE FROM users WHERE id = ?").run(anon);
  db.prepare("DELETE FROM verification_tokens WHERE identifier = ?").run(EMAIL);
  ok("nothing left behind", !db.prepare("SELECT 1 FROM users WHERE email = ?").get(EMAIL));

  console.log(failures ? `\n${failures} failing` : "\nthe passkey settings live in the header");
  process.exit(failures ? 1 : 0);
}

void main();
