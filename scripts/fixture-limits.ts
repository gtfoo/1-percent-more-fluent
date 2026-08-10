/**
 * Clear the rate-limit counters in the local database.
 *
 *   npx tsx scripts/fixture-limits.ts clear
 *
 * Exists so check-limits-http.sh can start from zero and leave nothing behind.
 * Without it the first run of that script eats the hour's allowance and every
 * run after it fails for an hour - including the developer's own use of the dev
 * server, which is a confusing way to discover you shipped a working limiter.
 *
 * Local only by construction: it talks to whatever DATA_DIR points at, which on
 * the droplet is not something any script here can reach.
 */
import { getDb } from "../src/server/db";

if (process.argv[2] !== "clear") {
  console.error("usage: fixture-limits.ts clear");
  process.exit(2);
}

const { changes } = getDb().prepare("DELETE FROM rate_limits").run();
console.log(`cleared ${changes}`);
