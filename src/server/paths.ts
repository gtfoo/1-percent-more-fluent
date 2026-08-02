import { join, resolve, sep } from "node:path";

/**
 * Where persistent state lives: the SQLite database and the synthesised audio.
 *
 * NOT derived from `process.cwd()` in production, and this is the whole point
 * of the file. Next's standalone server calls `process.chdir(__dirname)` on its
 * sixth line, so once deployed the working directory is `.next/standalone` -
 * a directory every rebuild throws away and recreates.
 *
 * Left to default, that means each deploy silently starts from a brand-new
 * empty database and orphans the entire audio cache, which costs real money to
 * regenerate. Nothing errors; the app just quietly forgets everything. So
 * production sets DATA_DIR explicitly, and the guard below turns the mistake
 * into a startup failure rather than a slow data leak.
 */
export const DATA_DIR = resolve(process.env.DATA_DIR ?? join(process.cwd(), "data"));

/** Synthesised audio. Served by src/app/audio/[file], never from public/. */
export const AUDIO_DIR = resolve(process.env.AUDIO_DIR ?? join(DATA_DIR, "audio"));

for (const [name, dir] of [
  ["DATA_DIR", DATA_DIR],
  ["AUDIO_DIR", AUDIO_DIR],
] as const) {
  if (dir.includes(`.next${sep}standalone`)) {
    throw new Error(
      `${name} resolved to ${dir}, inside the build output. The standalone ` +
        `server chdir's into .next/standalone, so this would be wiped on every ` +
        `deploy. Set ${name} to a path outside the build - see DEPLOY.md.`,
    );
  }
}
