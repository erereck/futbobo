import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const backgroundPath = new URL("../public/assets/futbobo-hero-v6-background.webp", import.meta.url);
const faviconPath = new URL("../public/favicon.svg", import.meta.url);
const outputPath = new URL("../public/og-v6.png", import.meta.url);

const [background, favicon] = await Promise.all([
  readFile(backgroundPath),
  readFile(faviconPath),
]);

const logo = await sharp(favicon).resize(152, 152).png().toBuffer();
const shade = Buffer.from(`
  <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#07140f" stop-opacity=".20"/>
        <stop offset=".48" stop-color="#07140f" stop-opacity=".08"/>
        <stop offset="1" stop-color="#07140f" stop-opacity=".70"/>
      </linearGradient>
      <radialGradient id="center">
        <stop offset="0" stop-color="#07140f" stop-opacity=".72"/>
        <stop offset=".72" stop-color="#07140f" stop-opacity=".18"/>
        <stop offset="1" stop-color="#07140f" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#edge)"/>
    <ellipse cx="600" cy="320" rx="430" ry="220" fill="url(#center)"/>
  </svg>
`);
const wordmark = Buffer.from(`
  <svg width="610" height="170" xmlns="http://www.w3.org/2000/svg">
    <style>
      .name { font: 900 104px Arial, sans-serif; letter-spacing: -5px; fill: #f5f7f2; }
      .accent { fill: #ffc72c; }
    </style>
    <text x="0" y="112" class="name">FUT<tspan class="accent">BOBO</tspan></text>
  </svg>
`);

await sharp(background)
  .resize(1200, 630, { fit: "cover", position: "centre" })
  .composite([
    { input: shade, left: 0, top: 0 },
    { input: logo, left: 205, top: 239 },
    { input: wordmark, left: 385, top: 231 },
  ])
  .png({ compressionLevel: 9, palette: true, quality: 92 })
  .toFile(fileURLToPath(outputPath));

console.log("Nova imagem principal criada em public/og-v6.png");
