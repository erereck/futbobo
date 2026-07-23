import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const ASSET_ROOT = path.resolve(ROOT, "public", "assets");
const expectedRoot = path.resolve(ROOT, "public");

if (!ASSET_ROOT.startsWith(`${expectedRoot}${path.sep}`)) {
  throw new Error(`Destino inesperado para otimização: ${ASSET_ROOT}`);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  }));
  return files.flat();
}

const files = (await walk(ASSET_ROOT)).filter((file) => file.toLowerCase().endsWith(".png"));
let before = 0;
let after = 0;

for (const file of files) {
  const originalSize = (await stat(file)).size;
  const relative = path.relative(ASSET_ROOT, file);
  const dimension = relative.startsWith(`clubs${path.sep}`) ? 192 : relative.startsWith(`flags${path.sep}`) ? 160 : 144;
  const optimized = await sharp(file)
    .resize({ width: dimension, height: dimension, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toBuffer();

  if (optimized.length < originalSize) {
    await writeFile(file, optimized);
    after += optimized.length;
  } else {
    after += originalSize;
  }
  before += originalSize;
}

console.log(`Otimizados ${files.length} PNGs: ${(before / 1024 / 1024).toFixed(2)} MB → ${(after / 1024 / 1024).toFixed(2)} MB`);
