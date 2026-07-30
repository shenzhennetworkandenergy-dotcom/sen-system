import assert from "node:assert/strict";
import fs from "node:fs";
import sharp from "sharp";

const officialLogo = "public/brand/sen-official-logo.png";
const pngIcons = [
  { path: "app/icon.png", size: 64 },
  { path: "app/apple-icon.png", size: 180 },
];

async function renderOfficialLogo(size) {
  return sharp(officialLogo)
    .resize(size, size, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();
}

for (const icon of pngIcons) {
  assert.ok(fs.existsSync(icon.path), `${icon.path} is missing`);
  const metadata = await sharp(icon.path).metadata();
  assert.equal(metadata.width, icon.size, `${icon.path} has the wrong width`);
  assert.equal(metadata.height, icon.size, `${icon.path} has the wrong height`);
  assert.deepEqual(
    await sharp(icon.path).png().toBuffer(),
    await renderOfficialLogo(icon.size),
    `${icon.path} is not derived from the official SEN logo`,
  );
}

const faviconPath = "app/favicon.ico";
assert.ok(fs.existsSync(faviconPath), `${faviconPath} is missing`);
const favicon = fs.readFileSync(faviconPath);
assert.equal(favicon.readUInt16LE(0), 0, "favicon.ico has an invalid reserved header");
assert.equal(favicon.readUInt16LE(2), 1, "favicon.ico is not an icon file");
const imageCount = favicon.readUInt16LE(4);
assert.equal(imageCount, 3, "favicon.ico must contain 16px, 32px, and 48px images");

const embeddedIcons = new Map();
for (let index = 0; index < imageCount; index += 1) {
  const entryOffset = 6 + index * 16;
  const size = favicon[entryOffset] || 256;
  const byteLength = favicon.readUInt32LE(entryOffset + 8);
  const imageOffset = favicon.readUInt32LE(entryOffset + 12);
  embeddedIcons.set(size, favicon.subarray(imageOffset, imageOffset + byteLength));
}

for (const size of [16, 32, 48]) {
  assert.ok(embeddedIcons.has(size), `favicon.ico is missing its ${size}px image`);
  const metadata = await sharp(embeddedIcons.get(size)).metadata();
  assert.equal(
    metadata.channels,
    4,
    `favicon.ico ${size}px image must use RGBA pixels for Next.js compatibility`,
  );
  assert.deepEqual(
    embeddedIcons.get(size),
    await sharp(await renderOfficialLogo(size)).ensureAlpha().png().toBuffer(),
    `favicon.ico ${size}px image is not derived from the official SEN logo`,
  );
}

console.log("Official SEN favicon assets verified.");
