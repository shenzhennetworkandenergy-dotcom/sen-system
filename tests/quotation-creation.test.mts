import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseQuotationItems } from "../lib/quotations/create.ts";
import { filterSaleProducts } from "../lib/sales/product-search.ts";

test("quotation items support multiple catalogue products and commercial values", () => {
  assert.deepEqual(
    parseQuotationItems([
      {
        product_id: "11111111-1111-4111-8111-111111111111",
        variation_id: null,
        quantity: 2,
        unit_price: 1250,
        discount_amount: 100,
        tax_amount: 50,
      },
      {
        product_id: "22222222-2222-4222-8222-222222222222",
        variation_id: "33333333-3333-4333-8333-333333333333",
        quantity: 1,
        unit_price: 5000,
        discount_amount: 0,
        tax_amount: 0,
      },
    ]),
    [
      {
        productId: "11111111-1111-4111-8111-111111111111",
        variationId: null,
        quantity: 2,
        unitPrice: 1250,
        discountAmount: 100,
        taxAmount: 50,
        lineSubtotal: 2500,
        lineTotal: 2450,
      },
      {
        productId: "22222222-2222-4222-8222-222222222222",
        variationId: "33333333-3333-4333-8333-333333333333",
        quantity: 1,
        unitPrice: 5000,
        discountAmount: 0,
        taxAmount: 0,
        lineSubtotal: 5000,
        lineTotal: 5000,
      },
    ],
  );
});

test("quotation item validation rejects duplicates and invalid totals", () => {
  const duplicate = {
    product_id: "11111111-1111-4111-8111-111111111111",
    variation_id: null,
    quantity: 1,
    unit_price: 100,
    discount_amount: 0,
    tax_amount: 0,
  };
  assert.throws(
    () => parseQuotationItems([duplicate, duplicate]),
    /only be added once/i,
  );
  assert.throws(
    () => parseQuotationItems([{ ...duplicate, discount_amount: 101 }]),
    /discount cannot exceed/i,
  );
});

test("quotation product search can locate a parent from a variation SKU", () => {
  const product = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Dell PowerEdge R740 Server",
    sku: "SEN-DELL-R740",
    model_number: "R740",
    search_terms: "R740XD-16S SEN-DELL-R740XD-16S",
  };
  assert.deepEqual(filterSaleProducts([product], "R740XD-16S"), [product]);
});

test("quotation creation uses a multi-product builder without additional fields or descriptions", async () => {
  const [page, builder, action, document, listing, navigation] = await Promise.all([
    readFile("app/admin/quotations/new/page.tsx", "utf8"),
    readFile("components/quotations/QuotationBuilder.tsx", "utf8"),
    readFile("app/admin/quotations/actions.ts", "utf8"),
    readFile("app/admin/quotations/[id]/page.tsx", "utf8"),
    readFile("app/admin/quotations/page.tsx", "utf8"),
    readFile("lib/navigation/dashboard.ts", "utf8"),
  ]);

  assert.match(page, /QuotationBuilder/);
  assert.match(builder, /Products and pricing/);
  assert.match(builder, /SaleProductPicker/);
  assert.match(builder, /\+ Add product/);
  assert.match(builder, /search_terms/);
  assert.match(builder, /hasIncompleteRow/);
  assert.match(action, /parseQuotationItems/);
  assert.match(action, /requirePermission\("quotations\.create"\)/);
  assert.doesNotMatch(`${page}\n${builder}`, /Additional product|Additional quantity/i);
  assert.doesNotMatch(action, /short_description/);
  assert.doesNotMatch(action, /description_snapshot\s*:/);
  assert.doesNotMatch(document, /description_snapshot/);
  assert.match(listing, /permissions\.has\("quotations\.create"\)/);
  assert.match(
    navigation,
    /Create Quotation.+\/admin\/quotations\/new.+quotations\.create/,
  );
});
