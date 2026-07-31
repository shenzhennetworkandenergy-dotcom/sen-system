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
  "width={48}",
  "Unit price",
  "Total quoted amount",
  "data.payment_terms",
  "data.delivery_information",
  "data.terms_and_conditions",
  "Authorized signature",
  "Customer acceptance",
  "defaultQuotationExpiration",
  "paginateQuotationItems",
  "calculateDocumentDiscounts",
  "downloadName",
]) {
  assert.ok(
    quotation.includes(requirement),
    `Printable quotation is missing: ${requirement}`,
  );
}

assert.ok(
  quotation.includes("bg-[#0f2747]") &&
    quotation.includes("border-[#1d4ed8]") &&
    quotation.includes("text-[#1d4ed8]"),
  "Printable quotation is missing its navy and blue SEN document theme.",
);
assert.ok(
  !quotation.includes("internal_notes"),
  "Printable quotation must not query or display internal notes.",
);
assert.ok(
  newQuotation.includes("defaultQuotationExpiration()"),
  "Create Quotation must show the five-day expiration default.",
);
assert.ok(
  quotationAction.includes("defaultQuotationExpiration()"),
  "Quotation creation must enforce the five-day expiration default.",
);

console.log("Quotation document verification passed.");
