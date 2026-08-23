import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  buildQuotationTraceabilityLookup,
} from "../lib/quotations/access-policy.ts";

test("quotation traceability lookup limits reverse links to the granted quotation scope", () => {
  assert.equal(
    buildQuotationTraceabilityLookup("sale-1", null, "employee-1"),
    null,
  );
  assert.deepEqual(
    buildQuotationTraceabilityLookup("sale-1", "all", "employee-1"),
    { convertedOrderId: "sale-1" },
  );
  assert.deepEqual(
    buildQuotationTraceabilityLookup("sale-1", "own", "employee-1"),
    { convertedOrderId: "sale-1", createdBy: "employee-1" },
  );
});

test("staff traceability renders links from the existing quotation relationship only", () => {
  const saleData = readFileSync("lib/sales/data.ts", "utf8");
  const salePage = readFileSync("app/admin/sales/[saleId]/page.tsx", "utf8");
  const quotationPage = readFileSync(
    "app/admin/quotations/[id]/manage/page.tsx",
    "utf8",
  );
  const operations = readFileSync(
    "components/quotations/QuotationOperations.tsx",
    "utf8",
  );

  assert.match(saleData, /from\("quotation_requests"\)/);
  assert.match(saleData, /eq\("converted_order_id",\s*lookup\.convertedOrderId\)/);
  assert.match(saleData, /eq\("created_by",\s*lookup\.createdBy\)/);
  assert.match(salePage, /Source Quotation/);
  assert.match(salePage, /sourceQuotation/);
  assert.match(quotationPage, /from\("sales_orders"\)/);
  assert.match(quotationPage, /order_number/);
  assert.match(operations, /Converted Sale/);
  assert.match(operations, /linkedSale/);
  assert.doesNotMatch(
    readFileSync("app/account/quotations/page.tsx", "utf8"),
    /Source Quotation|Converted Sale|sourceQuotation|linkedSale/,
  );
});

test("quotation to sale migrations do not add a second Sales-side quotation key", () => {
  const migrations = readdirSync("supabase/migrations")
    .filter((file) => file.endsWith(".sql"))
    .map((file) => readFileSync(join("supabase/migrations", file), "utf8"))
    .join("\n");

  assert.doesNotMatch(migrations, /sales_orders[\s\S]{0,160}source_quotation_id/i);
  assert.doesNotMatch(migrations, /source_quotation_id[\s\S]{0,160}sales_orders/i);
});
