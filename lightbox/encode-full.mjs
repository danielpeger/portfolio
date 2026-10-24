// Writes <folder>/full.avif next to a source image.
// assets/gizmodo/sketches.jpg → assets/gizmodo/sketches/full.avif
//
// Original pixel size, 4:4:4, high quality. The article keeps using
// 512.avif / 1024.avif / 1536.avif. The lightbox loads full.avif.

import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const sources = process.argv.slice(2);

if (sources.length === 0) {
  console.error("usage: node encode-full.mjs <image> [image...]");
  process.exit(1);
}

for (const source of sources) {
  const parsed = path.parse(source);
  const dir = path.join(parsed.dir, parsed.name);
  const out = path.join(dir, "full.avif");
  await mkdir(dir, { recursive: true });
  await sharp(source)
    .avif({
      quality: 70,
      effort: 6,
      chromaSubsampling: "4:4:4",
    })
    .toFile(out);
  const info = await sharp(out).metadata();
  console.log(
    `${out}  ${info.width}x${info.height}  ${info.chromaSubsampling}`,
  );
}
