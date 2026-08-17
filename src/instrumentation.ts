/**
 * Runs once when the server starts. Next calls `register` before serving.
 *
 * Only job today is the registered-user count. Sign-in is the moment the number
 * changes, and that is where it is written from — but a count that is only
 * written on sign-in never appears at all for an app nobody has signed into
 * since the file was invented, and stays stale for as long as nobody does.
 * Writing once at boot means a deploy is enough to refresh it.
 */
export async function register() {
  // Node only. The edge runtime has no filesystem, and this module is loaded in
  // both; without the guard the import below fails the build.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { writeUserCounts } = await import("./server/user-counts");
  writeUserCounts();
}
