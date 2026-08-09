/**
 * Derive every icon the app needs from one source image.
 *
 *   npm run icons
 *
 * Source of truth is assets/logo.png, which is deliberately NOT under public/:
 * it is 1254px and 1.5MB, and nothing should ever serve it to a phone. Every
 * file below is generated from it, so replacing the logo is one file plus one
 * command rather than a hunt through the tree.
 *
 * Two things are not just resizing:
 *
 *  - APPLE. iOS composites a transparent icon onto BLACK, which would put this
 *    artwork in a black square on the home screen. So the Apple icon is
 *    flattened onto the app's own background colour.
 *  - MASKABLE. Android crops adaptive icons to a circle or squircle, keeping
 *    roughly the middle 80%. The artwork runs to the edge of its frame, so the
 *    speech bubbles would be sliced off. The maskable variant is scaled down
 *    inside a padded, filled square so the crop has something to eat.
 *
 * sharp cannot write .ico, so favicon.ico is assembled here: an ICO is a small
 * header plus, since Vista, ordinary PNGs embedded whole.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const SOURCE = join("assets", "logo.png");

/** --background from src/app/globals.css. Warm off-white rather than pure. */
const BACKGROUND = "#faf8f5";

/** The share of the maskable square the artwork may occupy. */
const SAFE_ZONE = 0.8;

/**
 * Palette-quantised, which is the difference between a 351 KB favicon and a
 * 60 KB one. The artwork is flat-shaded cartoon, so 256 colours costs nothing
 * visible - it would be the wrong choice for a photograph.
 */
const PNG = { compressionLevel: 9, palette: true, quality: 90 } as const;

async function transparent(size: number, out: string) {
  await sharp(SOURCE)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png(PNG)
    .toFile(out);
}

async function flattened(size: number, out: string) {
  await sharp(SOURCE)
    .resize(size, size, { fit: "contain", background: BACKGROUND })
    .flatten({ background: BACKGROUND })
    .png(PNG)
    .toFile(out);
}

async function maskable(size: number, out: string) {
  const inner = Math.round(size * SAFE_ZONE);
  const pad = Math.round((size - inner) / 2);
  await sharp(SOURCE)
    .resize(inner, inner, { fit: "contain", background: BACKGROUND })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: BACKGROUND })
    .flatten({ background: BACKGROUND })
    .png(PNG)
    .toFile(out);
}

/**
 * An ICO wrapping PNGs.
 *
 * 6-byte directory header, then one 16-byte entry per image, then the PNG
 * payloads. A side of 256 is written as 0, which is the format's way of saying
 * "not 1..255" - irrelevant at these sizes but the reason the field is a single
 * byte at all.
 */
async function ico(sizes: number[], out: string) {
  // RGBA, NOT palette-quantised like everything else here. Next decodes this
  // file to generate the icon route, and its decoder rejects a palette PNG
  // inside an ICO outright - "The PNG is not in RGBA format" - which takes the
  // whole page down with a 500 rather than just serving a poor icon. At 16 to
  // 48 pixels the palette saved almost nothing anyway.
  const pngs = await Promise.all(
    sizes.map((s) =>
      sharp(SOURCE)
        .resize(s, s, { fit: "contain", background: BACKGROUND })
        .flatten({ background: BACKGROUND })
        // ensureAlpha because flatten REMOVES the alpha channel, leaving RGB -
        // and RGB is rejected just as firmly as palette. The channel is fully
        // opaque; it exists only to satisfy the decoder.
        .ensureAlpha()
        .png({ compressionLevel: 9, palette: false })
        .toBuffer(),
    ),
  );

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(sizes.length, 4);

  let offset = 6 + sizes.length * 16;
  const entries = sizes.map((size, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(pngs[i]!.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i]!.length;
    return e;
  });

  await writeFile(out, Buffer.concat([header, ...entries, ...pngs]));
}

async function main() {
  await readFile(SOURCE).catch(() => {
    throw new Error(`No ${SOURCE}. Put the logo there and run this again.`);
  });
  await mkdir("public", { recursive: true });

  // Next's file conventions: it emits the <link> tags and the sizes attribute
  // itself from these, so there is nothing to wire up in layout.tsx.
  await transparent(512, join("src", "app", "icon.png"));
  await flattened(180, join("src", "app", "apple-icon.png"));
  await ico([16, 32, 48], join("src", "app", "favicon.ico"));

  // Referenced by manifest.ts, so they need stable public paths.
  await transparent(192, join("public", "icon-192.png"));
  await transparent(512, join("public", "icon-512.png"));
  await maskable(512, join("public", "icon-maskable-512.png"));

  // Small enough to put in the header without thinking about it.
  await transparent(96, join("public", "logo-96.png"));

  console.log("wrote:");
  for (const f of [
    "src/app/icon.png",
    "src/app/apple-icon.png",
    "src/app/favicon.ico",
    "public/icon-192.png",
    "public/icon-512.png",
    "public/icon-maskable-512.png",
    "public/logo-96.png",
  ]) {
    const { size } = await import("node:fs").then((m) => m.statSync(f));
    console.log(`  ${String(Math.round(size / 1024)).padStart(4)} KB  ${f}`);
  }
}

void main();
