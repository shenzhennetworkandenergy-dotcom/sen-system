import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = process.cwd();
const importRoot = path.join(projectRoot, "data", "woocommerce-import-2026-07-24");
const outputRoot = path.join(importRoot, "image-review");
const manifest = JSON.parse(await fs.readFile(path.join(importRoot, "manifest.json"), "utf8"));
const rows = manifest.rows.filter((row) => row.images.length);
const entries = rows.flatMap((row) =>
  row.images.map((image, imageIndex) => ({
    row,
    image,
    imageIndex,
  })),
);

const tileWidth = 280;
const tileHeight = 250;
const imageSize = 205;
const columns = 5;
const rowsPerSheet = 5;
const perSheet = columns * rowsPerSheet;

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function labelLines(name) {
  const words = name.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > 34 && line) {
      lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
    if (lines.length === 2) break;
  }
  if (line && lines.length < 3) lines.push(line);
  return lines.slice(0, 3);
}

await fs.mkdir(outputRoot, { recursive: true });
for (let sheetIndex = 0; sheetIndex < Math.ceil(entries.length / perSheet); sheetIndex++) {
  const sheetEntries = entries.slice(sheetIndex * perSheet, (sheetIndex + 1) * perSheet);
  const composites = [];
  for (const [index, entry] of sheetEntries.entries()) {
    const left = (index % columns) * tileWidth;
    const top = Math.floor(index / columns) * tileHeight;
    const image = await sharp(path.join(projectRoot, entry.image.file))
      .resize(imageSize, imageSize, { fit: "contain", background: "#ffffff" })
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer();
    composites.push({ input: image, left: left + Math.floor((tileWidth - imageSize) / 2), top: top + 4 });
    const lines = labelLines(entry.row.name);
    const svg = `
      <svg width="${tileWidth}" height="41" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f8fafc"/>
        <text x="8" y="12" font-family="Arial" font-size="10" font-weight="700" fill="#0f172a">${xml(entry.row.sourceId)} · image ${entry.imageIndex + 1}/${entry.row.images.length}</text>
        ${lines.map((line, lineIndex) => `<text x="8" y="${25 + lineIndex * 11}" font-family="Arial" font-size="9" fill="#334155">${xml(line)}</text>`).join("")}
      </svg>`;
    composites.push({ input: Buffer.from(svg), left, top: top + imageSize + 5 });
  }
  const output = path.join(outputRoot, `review-${String(sheetIndex + 1).padStart(2, "0")}.jpg`);
  await sharp({
    create: {
      width: columns * tileWidth,
      height: rowsPerSheet * tileHeight,
      channels: 3,
      background: "#e2e8f0",
    },
  }).composite(composites).jpeg({ quality: 88 }).toFile(output);
  console.log(output);
}
