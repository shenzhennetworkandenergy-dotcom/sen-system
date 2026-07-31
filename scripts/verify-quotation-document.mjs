import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const quotation = await readFile(
  "app/admin/quotations/[id]/page.tsx",
  "utf8",
);
const newQuotation = await readFile(
  "app/admin/quotations/new/page.tsx",
  "utf8",
);
const quotationAction = await readFile(
  "app/admin/quotations/actions.ts",
  "utf8",
);

for (const requirement of [
  "min-h-[297mm]",
  "w-[210mm]",
  "@page { size: A4 portrait; margin: 0; }",
  "QUOTATION_PAGE_SIZE",
  "QUOTATION",
  "Quotation for",
  "Valid until",
  "House- 67, Level-3, Laboratory Road",
  "+8801805226599",
  "sen.com.bd",
  "szwaqia@vip.163.com",
  'className="h-12 w-12"',
  "Unit price",
  "Total quoted amount",
  "Payment terms",
  "Delivery information",
  "Terms and conditions",
  "Authorized signature",
  "Customer acceptance",
  "resolveQuotationExpirationDate",
  "downloadName",
]) {
  assert.ok(
    quotation.includes(requirement),
    `Printable quotation is missing: ${requirement}`,
  );
}

assert.ok(
  quotation.includes("from-rose-950") &&
    quotation.includes("via-red-900") &&
    quotation.includes("to-amber-700"),
  "Printable quotation is missing its burgundy, copper, and gold theme.",
);
assert.ok(
  !quotation.includes("internal_notes"),
  "Printable quotation must not query or display internal notes.",
);
assert.ok(
  newQuotation.includes("defaultQuotationExpirationDate()"),
  "Create Quotation must show the five-day expiration default.",
);
assert.ok(
  quotationAction.includes("defaultQuotationExpirationDate()"),
  "Quotation creation must enforce the five-day expiration default.",
);

console.log("Quotation document verification passed.");
