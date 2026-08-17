/**
 * Assert the registered-user file says something true, in the shape gtfoo reads.
 *
 *   npx tsx scripts/check-user-counts.ts
 *
 * Offline, against a scratch database. The interface belongs to another agent
 * (`gtfoo/docs/user-counts.md`), so a wrong field name or a wrong definition is
 * silent on both sides: we write happily, the panel renders nothing or - worse -
 * renders a number that is not true.
 *
 * The definition is what this mostly guards. `users` counts browsers here, not
 * people, and reporting it would be a fabricated number rather than a wrong one.
 */
import { mkdtempSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

let failures = 0;

function ok(name: string, condition: boolean, detail = "") {
  if (!condition) failures++;
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "check-user-counts-"));
  process.env.DATA_DIR = dir;
  process.env.USAGE_DIR = dir;
  process.env.AUTH_RESEND_KEY = "test-key";
  process.env.AUTH_PASSKEYS = "1";

  const { getDb } = await import("../src/server/db");
  const { writeUserCounts } = await import("../src/server/user-counts");
  const db = getDb();

  const addUser = (email: string | null, verified: boolean) =>
    db
      .prepare(
        "INSERT INTO users (id, created_at, email, email_verified) VALUES (?, ?, ?, ?)",
      )
      .run(randomUUID(), new Date().toISOString(), email, verified ? new Date().toISOString() : null);

  // Three anonymous cookie identities and two real accounts. This ratio is the
  // whole point: production is 21 rows against one account.
  addUser(null, false);
  addUser(null, false);
  addUser(null, false);
  addUser("a@example.com", true);
  addUser("b@example.com", true);

  writeUserCounts();

  const file = join(dir, "1-percent-more-fluent.users.json");
  ok("writes <app>.users.json", existsSync(file));
  const doc = JSON.parse(readFileSync(file, "utf8"));

  // --- the shape gtfoo parses ------------------------------------------------
  ok("names the app", doc.app === "1-percent-more-fluent", doc.app);
  ok("generated is ISO 8601 UTC", /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(doc.generated), doc.generated);
  for (const f of ["total", "magic_link", "passkey", "active_30d"]) {
    ok(`users.${f} present`, f in doc.users);
  }

  // --- the definition, which is the part that could publish a lie ------------
  ok(
    "counts ACCOUNTS, not anonymous cookie rows",
    doc.users.total === 2,
    `${doc.users.total} (5 rows in users, 3 of them anonymous)`,
  );
  ok("magic_link counts the completed email flow", doc.users.magic_link === 2);
  ok("passkey is 0 when offered and unused, not null", doc.users.passkey === 0);
  ok("active_30d is null - unmeasured, not zero", doc.users.active_30d === null);

  // --- never identifiers -----------------------------------------------------
  const raw = readFileSync(file, "utf8");
  ok("no email addresses in the file", !raw.includes("@example.com"));
  ok("no user ids in the file", !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(raw));

  // --- null means "not offered", and that is configuration, not data ---------
  delete process.env.AUTH_PASSKEYS;
  writeUserCounts();
  ok(
    "passkey is null when the method is switched off",
    JSON.parse(readFileSync(file, "utf8")).users.passkey === null,
  );

  delete process.env.AUTH_RESEND_KEY;
  writeUserCounts();
  const noAuth = JSON.parse(readFileSync(file, "utf8"));
  ok("magic_link is null when no email provider is configured", noAuth.users.magic_link === null);
  ok("...and passkeys cannot be offered without it either", noAuth.users.passkey === null);

  // --- atomicity and safety --------------------------------------------------
  ok(
    "leaves no temp file behind",
    !readdirSync(dir).some((f) => f.endsWith(".tmp")),
    readdirSync(dir).filter((f) => f.endsWith(".tmp")).join(", "),
  );

  // A failed write must never reach the caller: this runs inside a sign-in.
  process.env.USAGE_DIR = "/nonexistent/definitely/not/here";
  let threw = false;
  try {
    writeUserCounts();
  } catch {
    threw = true;
  }
  ok("an unwritable directory never throws", !threw);

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failing`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
