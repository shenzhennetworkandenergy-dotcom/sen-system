import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("quotation list presents shared business-state badges", () => {
  assert.equal(existsSync("components/quotations/QuotationStatusBadge.tsx"), true);
  const list = source("app/admin/quotations/page.tsx");
  const badge = source("components/quotations/QuotationStatusBadge.tsx");

  assert.match(list, /QuotationStatusBadge/);
  assert.match(badge, /quotationStatusMeta/);
});

test("management capabilities require customer-outcome and Sale creation permissions", () => {
  const page = source("app/admin/quotations/[id]/manage/page.tsx");

  assert.match(page, /recordCustomerOutcome:\s*can\("quotations\.record_customer_outcome"\)/);
  assert.match(page, /convertToSale:\s*can\("quotations\.convert_to_sale"\)\s*&&\s*can\("sales\.create"\)/);
});

test("operations only offer current outcome transitions and eligible Sale creation", () => {
  const operations = source("components/quotations/QuotationOperations.tsx");

  assert.match(operations, /canTransitionQuotation/);
  assert.match(operations, /isQuotationSaleEligible/);
  assert.match(operations, /\/admin\/sales\/new\?quotation=/);
  assert.match(
    operations,
    /canTransitionQuotation\(\s*quotation\.status,\s*"accept",\s*quotation\.expiration_date,\s*new Date\(\)\.toISOString\(\)\.slice\(0, 10\),\s*\)/,
  );
  assert.doesNotMatch(operations, />\s*Convert to Sales Invoice\s*</);
});
