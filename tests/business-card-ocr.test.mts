import assert from "node:assert/strict";
import test from "node:test";

import {
  scoreCustomerDuplicate,
  type DuplicateCheckInput,
} from "../lib/customer-ocr/duplicates.ts";
import {
  bilinearQuadPoint,
  detectCardQuad,
} from "../lib/customer-ocr/edge-detection.ts";
import { validateBusinessCardImage } from "../lib/customer-ocr/image-validation.ts";
import { parseBusinessCardOcr } from "../lib/customer-ocr/parser.ts";
import {
  cardEdgeWorkerTimeoutMs,
  orderQuadCorners,
  rotatedDimensions,
  shouldUseDetectedCard,
} from "../lib/customer-ocr/preprocess.ts";
import type { CustomerSearchOption } from "../lib/customers/search.ts";

const customer: CustomerSearchOption = {
  id: "11111111-1111-4111-8111-111111111111",
  full_name: "Amina Rahman",
  company_name: "Tex Rise Engineering",
  email: "amina@example.com",
  phone: "+8801711000001",
};

test("duplicate scoring finds normalized email phone and company identifiers", () => {
  const match = scoreCustomerDuplicate(
    {
      email: " AMINA@EXAMPLE.COM ",
      phone: "01711-000001",
      companyName: " tex rise  engineering ",
    },
    customer,
  );

  assert.deepEqual(match?.reasons, ["email", "phone", "company"]);
  assert.equal(match?.blocksCreation, true);
  assert.equal(match?.customer.id, customer.id);
});

test("a phone or company duplicate warns but permits an explicit override", () => {
  const match = scoreCustomerDuplicate(
    {
      email: "new-contact@example.com",
      phone: "+880 1711 000001",
      companyName: "Tex Rise Engineering",
    },
    customer,
  );

  assert.deepEqual(match?.reasons, ["phone", "company"]);
  assert.equal(match?.blocksCreation, false);
});

test("unrelated or empty identifiers do not produce duplicate candidates", () => {
  const inputs: DuplicateCheckInput[] = [
    { email: "other@example.com", phone: "+86 138 0000 0000", companyName: "Shenzhen Example" },
    { email: "", phone: "", companyName: "" },
  ];

  for (const input of inputs) {
    assert.equal(scoreCustomerDuplicate(input, customer), null);
  }
});

test("image validation accepts supported business-card images within 12 MB", () => {
  for (const type of [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ]) {
    assert.deepEqual(validateBusinessCardImage({ type, size: 12 * 1024 * 1024 }), {
      ok: true,
      message: "",
    });
  }
});

test("image validation rejects empty unsupported and oversized inputs", () => {
  assert.match(
    validateBusinessCardImage({ type: "application/pdf", size: 1024 }).message,
    /image/i,
  );
  assert.match(
    validateBusinessCardImage({ type: "image/jpeg", size: 12 * 1024 * 1024 + 1 }).message,
    /12 MB/i,
  );
  assert.match(
    validateBusinessCardImage({ type: "image/png", size: 0 }).message,
    /empty/i,
  );
  assert.match(
    validateBusinessCardImage({ type: "image/svg+xml", size: 512 }).message,
    /image/i,
  );
});

test("extracts a clear English business card into review fields", () => {
  const result = parseBusinessCardOcr([
    { text: "Amina Rahman", confidence: 96 },
    { text: "Sales Director", confidence: 88 },
    { text: "Tex Rise Engineering Ltd.", confidence: 92 },
    { text: "Mobile: +880 1711 000001", confidence: 94 },
    { text: "Phone: +880 2 55000000", confidence: 90 },
    { text: "amina@example.com", confidence: 98 },
    { text: "www.texrise.example", confidence: 91 },
    { text: "12 Motijheel C/A, Dhaka, Bangladesh", confidence: 87 },
  ]);

  assert.equal(result.contactName.value, "Amina Rahman");
  assert.equal(result.designation.value, "Sales Director");
  assert.equal(result.companyName.value, "Tex Rise Engineering Ltd.");
  assert.equal(result.mobileNumber.value, "+880 1711 000001");
  assert.equal(result.alternatePhone.value, "+880 2 55000000");
  assert.equal(result.emailAddress.value, "amina@example.com");
  assert.equal(result.website.value, "www.texrise.example");
  assert.equal(result.fullAddress.value, "12 Motijheel C/A, Dhaka, Bangladesh");
  assert.equal(result.city.value, "Dhaka");
  assert.equal(result.country.value, "Bangladesh");
});

test("an engineering company line is not mistaken for the contact designation", () => {
  const result = parseBusinessCardOcr([
    { text: "TEX RISE ENGINEERING", confidence: 96 },
    { text: "Amina Rahman", confidence: 96 },
    { text: "Sales Director", confidence: 96 },
  ]);

  assert.equal(result.companyName.value, "TEX RISE ENGINEERING");
  assert.equal(result.contactName.value, "Amina Rahman");
  assert.equal(result.designation.value, "Sales Director");
  assert.equal(result.designation.status, "ok");
});

test("extracts a Bangla contact and two phone numbers for review", () => {
  const result = parseBusinessCardOcr([
    { text: "তানভীর আহমেদ", confidence: 91 },
    { text: "বিক্রয় ব্যবস্থাপক", confidence: 86 },
    { text: "সেন ইঞ্জিনিয়ারিং লিমিটেড", confidence: 88 },
    { text: "মোবাইল: +880 1711 000001", confidence: 94 },
    { text: "ফোন: +880 2 55000000", confidence: 89 },
    { text: "tanvir@example.com", confidence: 97 },
    { text: "১২ মতিঝিল, ঢাকা, বাংলাদেশ", confidence: 84 },
  ]);

  assert.equal(result.contactName.value, "তানভীর আহমেদ");
  assert.equal(result.designation.value, "বিক্রয় ব্যবস্থাপক");
  assert.equal(result.companyName.value, "সেন ইঞ্জিনিয়ারিং লিমিটেড");
  assert.equal(result.mobileNumber.value, "+880 1711 000001");
  assert.equal(result.alternatePhone.value, "+880 2 55000000");
  assert.equal(result.city.value, "ঢাকা");
  assert.equal(result.country.value, "বাংলাদেশ");
});

test("normalizes Bengali numerals when extracting a phone number", () => {
  const result = parseBusinessCardOcr([
    { text: "আমিনা রহমান", confidence: 92 },
    { text: "মোবাইল: +৮৮০ ১৭১১ ০০০ ০০২", confidence: 91 },
  ]);

  assert.equal(result.mobileNumber.value, "+880 1711 000 002");
});

test("extracts a Simplified Chinese business card", () => {
  const result = parseBusinessCardOcr([
    { text: "深圳示例科技有限公司", confidence: 93 },
    { text: "李伟", confidence: 90 },
    { text: "销售经理", confidence: 87 },
    { text: "手机：+86 138 0000 0000", confidence: 95 },
    { text: "电话：+86 755 8888 0000", confidence: 89 },
    { text: "li.wei@example.cn", confidence: 97 },
    { text: "www.example.cn", confidence: 92 },
    { text: "中国广东省深圳市南山区科技园", confidence: 85 },
  ]);

  assert.equal(result.companyName.value, "深圳示例科技有限公司");
  assert.equal(result.contactName.value, "李伟");
  assert.equal(result.designation.value, "销售经理");
  assert.equal(result.mobileNumber.value, "+86 138 0000 0000");
  assert.equal(result.alternatePhone.value, "+86 755 8888 0000");
  assert.equal(result.fullAddress.value, "中国广东省深圳市南山区科技园");
  assert.equal(result.city.value, "深圳");
  assert.equal(result.country.value, "中国");
});

test("missing fields stay visible and low confidence", () => {
  const result = parseBusinessCardOcr([
    { text: "Noor Alam", confidence: 93 },
    { text: "noor@example.com", confidence: 96 },
  ]);

  assert.equal(result.contactName.value, "Noor Alam");
  assert.equal(result.companyName.value, "");
  assert.equal(result.companyName.confidence, null);
  assert.equal(result.companyName.status, "low");
  assert.equal(result.fullAddress.value, "");
});

test("an all-caps organization is not misread as an address when fields are missing", () => {
  const result = parseBusinessCardOcr([
    { text: "NORTH STAR CONTROLS", confidence: 94 },
    { text: "Nadia Karim", confidence: 95 },
    { text: "nadia.missing@example.com", confidence: 96 },
  ]);

  assert.equal(result.companyName.value, "NORTH STAR CONTROLS");
  assert.equal(result.contactName.value, "Nadia Karim");
  assert.equal(result.fullAddress.value, "");
  assert.equal(result.mobileNumber.status, "low");
});

test("multiple plausible emails are marked ambiguous and low OCR stays low", () => {
  const result = parseBusinessCardOcr([
    { text: "Mei Lin", confidence: 96 },
    { text: "mei@example.cn", confidence: 72 },
    { text: "sales@example.cn", confidence: 91 },
  ]);

  assert.equal(result.emailAddress.value, "mei@example.cn");
  assert.equal(result.emailAddress.status, "ambiguous");
  assert.equal(result.emailAddress.confidence, 72);
});

test("card preprocessing orders detected corners for a perspective transform", () => {
  assert.deepEqual(
    orderQuadCorners([
      { x: 890, y: 510 },
      { x: 110, y: 90 },
      { x: 900, y: 100 },
      { x: 100, y: 500 },
    ]),
    [
      { x: 110, y: 90 },
      { x: 900, y: 100 },
      { x: 890, y: 510 },
      { x: 100, y: 500 },
    ],
  );
});

test("card preprocessing swaps dimensions only for quarter turns", () => {
  assert.deepEqual(rotatedDimensions(1200, 700, 90), {
    width: 700,
    height: 1200,
  });
  assert.deepEqual(rotatedDimensions(1200, 700, -90), {
    width: 700,
    height: 1200,
  });
  assert.deepEqual(rotatedDimensions(1200, 700, 180), {
    width: 1200,
    height: 700,
  });
});

test("perspective crop is accepted only for a large reliable card contour", () => {
  assert.equal(
    shouldUseDetectedCard({ areaRatio: 0.72, rectangularity: 0.91 }),
    true,
  );
  assert.equal(
    shouldUseDetectedCard({ areaRatio: 0.12, rectangularity: 0.96 }),
    false,
  );
  assert.equal(
    shouldUseDetectedCard({ areaRatio: 0.64, rectangularity: 0.61 }),
    false,
  );
});

test("card-edge detection is bounded so OCR can fall back without freezing the form", () => {
  assert.ok(cardEdgeWorkerTimeoutMs >= 5_000);
  assert.ok(cardEdgeWorkerTimeoutMs <= 20_000);
});

test("lightweight edge detection finds and maps a contrasting card quadrilateral", () => {
  const width = 120;
  const height = 80;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const inside = x >= 12 && x <= 106 && y >= 9 && y <= 69;
      pixels[offset] = inside ? 245 : 25;
      pixels[offset + 1] = inside ? 245 : 25;
      pixels[offset + 2] = inside ? 245 : 25;
      pixels[offset + 3] = 255;
    }
  }

  const corners = detectCardQuad(pixels, width, height);
  assert.ok(corners);
  assert.ok(corners[0].x <= 14 && corners[0].y <= 11);
  assert.ok(corners[2].x >= 104 && corners[2].y >= 67);
  assert.deepEqual(bilinearQuadPoint(corners, 0.5, 0.5), {
    x: 59,
    y: 39,
  });
});

test("edge detection handles a densely textured image without argument overflow", () => {
  const width = 1_024;
  const height = 1_024;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const shade =
        (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0 ? 0 : 255;
      pixels[offset] = shade;
      pixels[offset + 1] = shade;
      pixels[offset + 2] = shade;
      pixels[offset + 3] = 255;
    }
  }

  assert.doesNotThrow(() => detectCardQuad(pixels, width, height));
});
