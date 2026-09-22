import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const outputDirectory = fileURLToPath(new URL("./", import.meta.url));

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function cardSvg(lines, options = {}) {
  const family = options.family ?? "Arial, sans-serif";
  const background = options.background ?? "#f8fafc";
  const foreground = options.foreground ?? "#111827";
  const lineMarkup = lines
    .map(
      (line, index) =>
        `<text x="90" y="${150 + index * 66}" font-size="${index === 0 ? 44 : 32}" font-weight="${index < 2 ? 700 : 400}">${escapeXml(line)}</text>`,
    )
    .join("");
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700">
      <rect width="1200" height="700" rx="28" fill="${background}"/>
      <rect x="18" y="18" width="1164" height="664" rx="22" fill="none" stroke="#1d4ed8" stroke-width="6"/>
      <g fill="${foreground}" font-family="${family}">${lineMarkup}</g>
    </svg>
  `);
}

const fixtures = [
  {
    name: "english-clear.png",
    lines: [
      "TEX RISE ENGINEERING",
      "Amina Rahman",
      "Sales Director",
      "+880 1711 000 001  |  +880 2 955 0110",
      "business-card-duplicate@example.com",
      "www.texrise.example",
      "12 Motijheel Commercial Area, Dhaka, Bangladesh",
    ],
  },
  {
    name: "bangla-clear.png",
    family: "Noto Sans Bengali, Nirmala UI, sans-serif",
    lines: [
      "টেক্স রাইজ ইঞ্জিনিয়ারিং",
      "আমিনা রহমান",
      "বিক্রয় পরিচালক",
      "+৮৮০ ১৭১১ ০০০ ০০২",
      "amina.bangla@example.com",
      "১২ মতিঝিল বাণিজ্যিক এলাকা, ঢাকা, বাংলাদেশ",
    ],
  },
  {
    name: "chinese-clear.png",
    family: "Microsoft YaHei, Noto Sans CJK SC, sans-serif",
    lines: [
      "深圳示例科技有限公司",
      "李伟",
      "销售总监",
      "+86 138 0000 0000  |  +86 755 8888 0000",
      "li.wei@example.cn",
      "www.example.cn",
      "中国广东省深圳市南山区科技园",
    ],
  },
  {
    name: "missing-fields.png",
    lines: [
      "NORTH STAR CONTROLS",
      "Nadia Karim",
      "nadia.missing@example.com",
    ],
  },
  {
    name: "multiple-phones.png",
    lines: [
      "MULTILINE INDUSTRIES",
      "Chen Rahman",
      "Operations Manager",
      "Mobile: +880 1811 222 333",
      "Office: +880 2 944 5566",
      "chen.multiphone@example.com",
      "45 Gulshan Avenue, Dhaka, Bangladesh",
    ],
  },
];

await mkdir(outputDirectory, { recursive: true });
for (const fixture of fixtures) {
  await sharp(cardSvg(fixture.lines, { family: fixture.family }))
    .png()
    .toFile(`${outputDirectory}${fixture.name}`);
}

await sharp(cardSvg(fixtures[0].lines))
  .rotate(90, { background: "white" })
  .png()
  .toFile(`${outputDirectory}english-rotated.png`);

await sharp(cardSvg(fixtures[0].lines, { background: "#d1d5db", foreground: "#6b7280" }))
  .resize(480)
  .blur(1.8)
  .jpeg({ quality: 32 })
  .toFile(`${outputDirectory}english-poor-quality.jpg`);
