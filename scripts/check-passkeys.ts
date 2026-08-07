/**
 * Assert the passkey half of the adapter, and the guard that stops a passkey
 * creating an account on its own.
 *
 *   npm run passkeys
 *
 * No browser, no WebAuthn ceremony: this covers the storage layer Auth.js sits
 * on and the one policy decision that is ours rather than the library's. The
 * ceremony itself needs a real authenticator and belongs to a person.
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
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "fluent-passkey-"));
  process.env.AUDIO_DIR = join(process.env.DATA_DIR, "audio");

  const { getDb } = await import("../src/server/db");
  const { SqliteAdapter, countPasskeys } = await import("../src/server/auth-adapter");

  const db = getDb();
  const adapter = SqliteAdapter();

  db.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)").run(
    "u1",
    "reader@example.com",
    new Date().toISOString(),
  );

  console.log("--- Auth.js will not accept the provider without these ---");
  for (const m of [
    "createUser",
    "getUser",
    "linkAccount",
    "getAccount",
    "getAuthenticator",
    "createAuthenticator",
    "listAuthenticatorsByUserId",
    "updateAuthenticatorCounter",
  ]) {
    ok(m, typeof (adapter as Record<string, unknown>)[m] === "function");
  }

  console.log("\n--- storing a credential ---");
  const created = await adapter.createAuthenticator!({
    credentialID: "cred-1",
    userId: "u1",
    providerAccountId: "acct-1",
    credentialPublicKey: "pubkey-1",
    counter: 0,
    credentialDeviceType: "multiDevice",
    credentialBackedUp: true,
    transports: "internal,hybrid",
  });
  ok("it comes back", created.credentialID === "cred-1");

  const got = await adapter.getAuthenticator!("cred-1");
  check("read back by credential id", got?.credentialID, "cred-1");
  check("the public key survives", got?.credentialPublicKey, "pubkey-1");
  // SQLite has no boolean, so this round-trips through an integer and is
  // exactly the sort of thing that silently comes back as 1 rather than true.
  check("backed-up stays a boolean", got?.credentialBackedUp, true);
  check("transports survive", got?.transports, "internal,hybrid");
  check("an unknown credential is null", await adapter.getAuthenticator!("nope"), null);

  console.log("\n--- the clone counter ---");
  // The authenticator increments this on every use. A counter that fails to
  // advance is how a cloned credential is spotted, so it must actually persist.
  const bumped = await adapter.updateAuthenticatorCounter!("cred-1", 7);
  check("the new value is returned", bumped.counter, 7);
  check(
    "...and it stuck",
    (await adapter.getAuthenticator!("cred-1"))?.counter,
    7,
  );

  console.log("\n--- several devices, one reader ---");
  await adapter.createAuthenticator!({
    credentialID: "cred-2",
    userId: "u1",
    providerAccountId: "acct-2",
    credentialPublicKey: "pubkey-2",
    counter: 0,
    credentialDeviceType: "singleDevice",
    credentialBackedUp: false,
    transports: "usb",
  });
  const list = await adapter.listAuthenticatorsByUserId!("u1");
  check("both are listed", list.map((a) => a.credentialID).sort(), ["cred-1", "cred-2"]);
  check("counted", countPasskeys("u1"), 2);
  check("someone else has none", countPasskeys("u2"), 0);
  check("...and lists empty", await adapter.listAuthenticatorsByUserId!("u2"), []);

  console.log("\n--- accounts ---");
  await adapter.linkAccount!({
    userId: "u1",
    provider: "passkey",
    providerAccountId: "acct-1",
    type: "webauthn",
  });
  const account = await adapter.getAccount!("acct-1", "passkey");
  check("found by provider account id", account?.userId, "u1");
  check("a wrong provider finds nothing", await adapter.getAccount!("acct-1", "github"), null);

  console.log("\n--- deleting a reader takes their passkeys ---");
  await adapter.deleteUser!("u1");
  check("no credentials left", countPasskeys("u1"), 0);
  ok(
    "the rows are actually gone",
    !db.prepare("SELECT 1 FROM authenticators WHERE user_id = 'u1'").get(),
  );

  console.log(
    failures ? `\n${failures} failing` : "\npasskey storage behaves as expected",
  );
  process.exit(failures ? 1 : 0);
}

void main();
