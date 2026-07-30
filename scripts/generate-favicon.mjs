import fs from "node:fs/promises";
import sharp from "sharp";

const officialLogo = "public/brand/sen-official-logo.png";

async function render(size) {
  return sharp(officialLogo)
    .resize(size, size, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();
}

async function renderIcoImage(size) {
  return sharp(await render(size)).ensureAlpha().png().toBuffer();
}

await Promise.all([
  render(64).then((buffer) => fs.writeFile("app/icon.png", buffer)),
  render(180).then((buffer) => fs.writeFile("app/apple-icon.png", buffer)),
]);

const faviconSizes = [16, 32, 48];
const faviconImages = await Promise.all(faviconSizes.map(renderIcoImage));
const header = Buffer.alloc(6 + faviconImages.length * 16);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(faviconImages.length, 4);

let imageOffset = header.length;
faviconImages.forEach((image, index) => {
  const entryOffset = 6 + index * 16;
  const size = faviconSizes[index];
  header[entryOffset] = size;
  header[entryOffset + 1] = size;
  header[entryOffset + 2] = 0;
  header[entryOffset + 3] = 0;
  header.writeUInt16LE(1, entryOffset + 4);
  header.writeUInt16LE(32, entryOffset + 6);
  header.writeUInt32LE(image.length, entryOffset + 8);
  header.writeUInt32LE(imageOffset, entryOffset + 12);
  imageOffset += image.length;
});

await fs.writeFile("app/favicon.ico", Buffer.concat([header, ...faviconImages]));
console.log("Generated official SEN favicon assets.");
