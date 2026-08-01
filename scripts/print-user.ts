import Database from "better-sqlite3";

const db = new Database("data/fluent.sqlite", { readonly: true });
// Oldest profile, deliberately: the newest one is whoever is using the app
// right now, and a smoke test should not generate pieces as them or move their
// level around.
const row = db
  .prepare("SELECT user_id FROM profiles ORDER BY placed_at ASC LIMIT 1")
  .get() as { user_id: string } | undefined;

if (!row) {
  console.error("no profiles");
  process.exit(1);
}
console.log(row.user_id);
