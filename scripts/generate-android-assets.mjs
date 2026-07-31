import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const logo = path.join(root, "public", "favicon.svg");
const resources = path.join(root, "android", "app", "src", "main", "res");
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

for (const [density, size] of Object.entries(densities)) {
  const directory = path.join(resources, `mipmap-${density}`);
  const fullIcon = await sharp(logo).resize(size, size).png().toBuffer();
  const foregroundSize = Math.round(size * 0.72);
  const foreground = await sharp(logo).resize(foregroundSize, foregroundSize).png().toBuffer();
  const foregroundCanvas = await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: foreground, gravity: "center" }]).png().toBuffer();
  await sharp(fullIcon).toFile(path.join(directory, "ic_launcher.png"));
  await sharp(fullIcon).toFile(path.join(directory, "ic_launcher_round.png"));
  await sharp(foregroundCanvas).toFile(path.join(directory, "ic_launcher_foreground.png"));
}

for (const entry of await readdir(resources, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith("drawable")) continue;
  const splashPath = path.join(resources, entry.name, "splash.png");
  try {
    const metadata = await sharp(splashPath).metadata();
    if (!metadata.width || !metadata.height) continue;
    const logoSize = Math.round(Math.min(metadata.width, metadata.height) * 0.22);
    const centeredLogo = await sharp(logo).resize(logoSize, logoSize).png().toBuffer();
    await sharp({
      create: {
        width: metadata.width,
        height: metadata.height,
        channels: 4,
        background: "#061710",
      },
    }).composite([{ input: centeredLogo, gravity: "center" }]).png().toFile(`${splashPath}.new`);
    await sharp(`${splashPath}.new`).toFile(splashPath);
    await unlink(`${splashPath}.new`);
  } catch {
    // Algumas pastas drawable não possuem splash; não há nada a gerar nelas.
  }
}
