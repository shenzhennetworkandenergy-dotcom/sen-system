import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("quotation sale search and prefill modules expose only the approved safe contract", () => {
  const typesPath = "lib/quotations/sale-conversion-types.ts";
  assert.equal(existsSync(typesPath), true);
  const types = source(typesPath);

  for (const field of [
    "quotationItemId",
    "productId",
    "variationId",
    "quantity",
    "unitPrice",
    "lineDiscount",
    "lineTax",
    "quotationId",
    "customerId",
    "billingAddressId",
    "shippingAddressId",
    "expectedDeliveryDate",
    "discountAmount",
    "taxAmount",
    "customerNotes",
    "internalNotes",
    "paymentTerms",
    "deliveryInformation",
    "termsAndConditions",
  ]) {
    assert.match(types, new RegExp(`\\b${field}\\b`));
  }
  assert.match(types, /QUOTATION_SALE_CONVERSION_PERMISSIONS/);
  assert.match(types, /"quotations\.convert_to_sale"/);
  assert.match(types, /"sales\.create"/);
});

test("eligible search action reauthorizes both permissions, limits input, and delegates to the bounded RPC", () => {
  const actionsPath = "app/admin/sales/from-quotation/actions.ts";
  assert.equal(existsSync(actionsPath), true);
  const actions = source(actionsPath);

  assert.match(actions, /"use server"/);
  assert.match(actions, /requireAllPermissions\(\[\s*\.\.\.QUOTATION_SALE_CONVERSION_PERMISSIONS/);
  assert.match(actions, /resolveQuotationViewScope/);
  assert.match(actions, /if \(!scope\)/);
  assert.match(actions, /\.trim\(\)\.slice\(0, 80\)/);
  assert.match(actions, /if \(query\.length < 2\)/);
  assert.match(actions, /requested_limit:\s*20/);
  assert.match(actions, /search_eligible_quotations_for_sale/);
  assert.doesNotMatch(actions, /error\.message/);
});

test("prefill loader is read-only, scope-aware, and only loads accepted unexpired unconverted active-customer quotations", () => {
  const loaderPath = "lib/quotations/sale-conversion.ts";
  assert.equal(existsSync(loaderPath), true);
  const loader = source(loaderPath);

  assert.match(loader, /import "server-only"/);
  assert.match(loader, /requireAllPermissions\(\[\s*\.\.\.QUOTATION_SALE_CONVERSION_PERMISSIONS/);
  assert.match(loader, /resolveQuotationViewScope/);
  assert.match(loader, /if \(!scope\)/);
  assert.match(loader, /\.eq\("status", "accepted"\)/);
  assert.match(loader, /\.is\("converted_order_id", null\)/);
  assert.match(loader, /expiration_date\.gte/);
  assert.match(loader, /\.eq\("created_by", profile\.id\)/);
  assert.match(loader, /profiles!inner\(id,status\)/);
  assert.match(loader, /\.eq\("profiles\.status", "active"\)/);
  assert.match(loader, /quotation_request_items/);
  assert.doesNotMatch(loader, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
  assert.doesNotMatch(loader, /error\.message/);
});

test("quotation selection page and typeahead preserve a permission-gated read-only selection flow", () => {
  const pagePath = "app/admin/sales/from-quotation/page.tsx";
  const typeaheadPath = "components/sales/QuotationTypeahead.tsx";
  assert.equal(existsSync(pagePath), true);
  assert.equal(existsSync(typeaheadPath), true);
  const page = source(pagePath);
  const typeahead = source(typeaheadPath);

  assert.match(page, /requireAllPermissions\(\[\s*\.\.\.QUOTATION_SALE_CONVERSION_PERMISSIONS/);
  assert.match(page, /resolveQuotationViewScope/);
  assert.match(page, /if \(!scope\)/);
  assert.match(page, /QuotationTypeahead/);
  assert.match(typeahead, /setTimeout\(/);
  assert.match(typeahead, /250/);
  assert.match(typeahead, /query\.length < 2/);
  assert.match(typeahead, /router\.push\(`\/admin\/sales\/new\?quotation=\$\{option\.quotationId\}`\)/);
  assert.match(typeahead, /option\.reference/);
  assert.match(typeahead, /option\.customerName/);
  assert.match(typeahead, /option\.customerCompany/);
  assert.match(typeahead, /option\.totalAmount/);
  assert.match(typeahead, /let active = true/);
  assert.match(typeahead, /return \(\) => \{/);
  assert.doesNotMatch(typeahead, /error\.message/);
});
