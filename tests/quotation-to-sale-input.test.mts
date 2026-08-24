import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import type { DraftSaleInput } from "../lib/sales/create-draft-input.ts";

const parserPath = "lib/sales/create-draft-input.ts";
const parserModule = existsSync(parserPath)
  ? await import("../lib/sales/create-draft-input.ts")
  : ({} as Record<string, unknown>);

const customerId = "11111111-1111-4111-8111-111111111111";
const warehouseId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";
const variationId = "44444444-4444-4444-8444-444444444444";
const quotationId = "55555555-5555-4555-8555-555555555555";
const quotationItemId = "66666666-6666-4666-8666-666666666666";
const shippingAddressId = "77777777-7777-4777-8777-777777777777";
const billingAddressId = "88888888-8888-4888-8888-888888888888";
type NormalizedSaleResult = {
  saleId: string;
  saleNumber: string;
  existing: boolean;
} | null;
type ParseDraftSaleInput = (
  form: FormData,
  options: { mode: "manual" | "quotation" },
) => DraftSaleInput;

function productionFunction<T extends (...args: never[]) => unknown>(name: string) {
  const candidate = (parserModule as Record<string, unknown>)[name];
  assert.equal(typeof candidate, "function", `${name} must be exported`);
  return candidate as T;
}

function validForm() {
  const form = new FormData();
  form.set("customer_id", customerId);
  form.set("warehouse_id", warehouseId);
  form.set("address_id", shippingAddressId);
  form.set("billing_address_id", billingAddressId);
  form.set("sales_source", "direct_office");
  form.set("expected_delivery_date", "2026-09-01");
  form.set("discount_amount", "4.25");
  form.set("shipping_amount", "2.50");
  form.set("service_amount", "3.75");
  form.set("tax_amount", "1.25");
  form.set("internal_notes", "  Internal note  ");
  form.set("customer_notes", "  Customer note  ");
  form.set("discount_reason", "Approved header discount");
  form.set("items", JSON.stringify([{
    product_id: productId,
    variation_id: variationId,
    warehouse_id: warehouseId,
    source_quotation_item_id: quotationItemId,
    quantity: "2",
    unit_price: "10.25",
    catalogue_price: "12.00",
    line_discount: "1.50",
    line_tax: "0.75",
    price_overridden: true,
    adjustment_reason: "Approved line review",
  }]));
  return form;
}

test("shared draft parser normalizes UUIDs, commercial values, dates, notes, addresses, and lines", () => {
  const parse = productionFunction<ParseDraftSaleInput>("parseDraftSaleInput");
  const form = validForm();
  form.set("adjustments", "[]");
  const parsed = parse(form, { mode: "quotation" });

  assert.deepEqual({
    customerId: parsed.customerId,
    warehouseId: parsed.warehouseId,
    addressId: parsed.addressId,
    billingAddressId: parsed.billingAddressId,
    source: parsed.source,
    expectedDeliveryDate: parsed.expectedDeliveryDate,
    discountAmount: parsed.discountAmount,
    shippingAmount: parsed.shippingAmount,
    serviceAmount: parsed.serviceAmount,
    taxAmount: parsed.taxAmount,
    internalNotes: parsed.internalNotes,
    customerNotes: parsed.customerNotes,
    address: parsed.address,
    billingAddress: parsed.billingAddress,
  }, {
    customerId,
    warehouseId,
    addressId: shippingAddressId,
    billingAddressId,
    source: "direct_office",
    expectedDeliveryDate: "2026-09-01",
    discountAmount: 4.25,
    shippingAmount: 2.5,
    serviceAmount: 3.75,
    taxAmount: 1.25,
    internalNotes: "Internal note",
    customerNotes: "Customer note",
    address: {},
    billingAddress: null,
  });
  assert.deepEqual(parsed.items, [{
    product_id: productId,
    variation_id: variationId,
    warehouse_id: warehouseId,
    source_quotation_item_id: quotationItemId,
    quantity: 2,
    unit_price: 10.25,
    catalogue_price: 12,
    line_discount: 1.5,
    line_tax: 0.75,
    price_overridden: true,
    adjustment_reason: "Approved line review",
  }]);
});

test("custom-address draft parsing preserves the existing compatible snapshot contract", () => {
  const parse = productionFunction<ParseDraftSaleInput>("parseDraftSaleInput");
  const form = validForm();
  form.delete("address_id");
  form.delete("billing_address_id");
  form.set("recipient_name", "Amina Rahman");
  form.set("phone", "+8801000000000");
  form.set("address_line_1", "1 Test Road");
  form.set("city", "Dhaka");
  form.set("country_code", "bd");

  const parsed = parse(form, { mode: "manual" });
  assert.equal(parsed.addressId, null);
  assert.equal(parsed.billingAddressId, null);
  assert.equal(parsed.address.recipient_name, "Amina Rahman");
  assert.equal(parsed.address.country_code, "BD");
  assert.deepEqual(parsed.billingAddress, parsed.address);
});

test("explicit conversion adjustments require exact safe shapes and retain line identifiers", () => {
  const parse = productionFunction<ParseDraftSaleInput>("parseDraftSaleInput");
  const form = validForm();
  form.set("adjustments", JSON.stringify([
    {
      order_item_id: null,
      source_quotation_item_id: quotationItemId,
      product_id: productId,
      variation_id: variationId,
      adjustment_type: "manual_unit_price",
      previous_value: "12.00",
      new_value: "10.25",
      reason: "Approved line review",
    },
    {
      order_item_id: null,
      source_quotation_item_id: null,
      product_id: null,
      variation_id: null,
      adjustment_type: "order_discount",
      previous_value: "0",
      new_value: "4.25",
      reason: "Approved header discount",
    },
  ]));

  assert.deepEqual(parse(form, { mode: "quotation" }).adjustments, [
    {
      order_item_id: null,
      source_quotation_item_id: quotationItemId,
      product_id: productId,
      variation_id: variationId,
      adjustment_type: "manual_unit_price",
      previous_value: 12,
      new_value: 10.25,
      reason: "Approved line review",
    },
    {
      order_item_id: null,
      source_quotation_item_id: null,
      product_id: null,
      variation_id: null,
      adjustment_type: "order_discount",
      previous_value: 0,
      new_value: 4.25,
      reason: "Approved header discount",
    },
  ]);
});

test("manual mode strips quotation sources and ignores forged explicit adjustment arrays", () => {
  const parse = productionFunction<ParseDraftSaleInput>("parseDraftSaleInput");
  const form = validForm();
  form.set("quotation_id", quotationId);
  form.set("adjustments", JSON.stringify([{
    order_item_id: null,
    source_quotation_item_id: quotationItemId,
    product_id: productId,
    variation_id: variationId,
    adjustment_type: "manual_unit_price",
    previous_value: 999,
    new_value: 0,
    reason: "Forged replacement",
  }]));
  const parsed = parse(form, { mode: "manual" });

  assert.deepEqual(parsed.items, [{
    product_id: productId,
    variation_id: variationId,
    warehouse_id: warehouseId,
    quantity: 2,
    unit_price: 10.25,
    catalogue_price: 12,
    line_discount: 1.5,
    line_tax: 0.75,
    price_overridden: true,
    adjustment_reason: "Approved line review",
  }]);
  assert.deepEqual(parsed.adjustments, [
    {
      order_item_id: null,
      adjustment_type: "manual_unit_price",
      previous_value: 12,
      new_value: 10.25,
      reason: "Approved line review",
    },
    {
      order_item_id: null,
      adjustment_type: "order_discount",
      previous_value: 0,
      new_value: 4.25,
      reason: "Approved header discount",
    },
    {
      order_item_id: null,
      adjustment_type: "service_charge",
      previous_value: 0,
      new_value: 3.75,
      reason: "Installation or service charge",
    },
  ]);
  assert.equal("quotationId" in parsed, false);
});

test("quotation mode retains source IDs and accepts an explicit empty adjustment history when unchanged", () => {
  const parse = productionFunction<ParseDraftSaleInput>("parseDraftSaleInput");
  const form = validForm();
  form.set("discount_amount", "0");
  form.set("service_amount", "0");
  form.set("items", JSON.stringify([{
    product_id: productId,
    variation_id: variationId,
    warehouse_id: warehouseId,
    source_quotation_item_id: quotationItemId,
    quantity: 2,
    unit_price: 12,
    catalogue_price: 12,
    line_discount: 0,
    line_tax: 0.75,
    price_overridden: false,
    adjustment_reason: "Approved quotation",
  }]));
  form.set("adjustments", "[]");

  const parsed = parse(form, { mode: "quotation" });
  assert.equal(parsed.items[0]?.source_quotation_item_id, quotationItemId);
  assert.deepEqual(parsed.adjustments, []);
});

test("pure RPC builders expose exact manual and quotation argument contracts", () => {
  const parse = productionFunction<ParseDraftSaleInput>("parseDraftSaleInput");
  const buildManual = productionFunction<(
    actorProfileId: string,
    input: DraftSaleInput,
  ) => Record<string, unknown>>("buildManualSaleRpcArguments");
  const buildQuotation = productionFunction<(
    actorProfileId: string,
    quotationId: string,
    input: DraftSaleInput,
  ) => Record<string, unknown>>("buildQuotationSaleRpcArguments");

  const form = validForm();
  form.set("adjustments", "[]");
  const manual = parse(form, { mode: "manual" });
  assert.deepEqual(buildManual(customerId, manual), {
    actor_profile_id: customerId,
    requested_customer_id: customerId,
    requested_address_id: shippingAddressId,
    requested_address: {},
    requested_billing_address_id: billingAddressId,
    requested_billing_address: null,
    requested_warehouse_id: warehouseId,
    requested_source: "direct_office",
    requested_expected_delivery_date: "2026-09-01",
    requested_discount: 4.25,
    requested_shipping: 2.5,
    requested_service: 3.75,
    requested_tax: 1.25,
    requested_internal_notes: "Internal note",
    requested_customer_notes: "Customer note",
    requested_items: manual.items,
    requested_adjustments: manual.adjustments,
  });

  const quotationForm = validForm();
  quotationForm.set("adjustments", "[]");
  const quotation = parse(quotationForm, { mode: "quotation" });
  assert.deepEqual(buildQuotation(customerId, quotationId, quotation), {
    actor_profile_id: customerId,
    requested_quotation_id: quotationId,
    requested_customer_id: customerId,
    requested_address_id: shippingAddressId,
    requested_address: {},
    requested_billing_address_id: billingAddressId,
    requested_billing_address: null,
    requested_warehouse_id: warehouseId,
    requested_source: "direct_office",
    requested_expected_delivery_date: "2026-09-01",
    requested_discount: 4.25,
    requested_shipping: 2.5,
    requested_service: 3.75,
    requested_tax: 1.25,
    requested_internal_notes: "Internal note",
    requested_customer_notes: "Customer note",
    requested_items: quotation.items,
    requested_adjustments: [],
  });
  assert.equal(
    (buildManual(customerId, manual).requested_items as Array<Record<string, unknown>>)[0]
      ?.source_quotation_item_id,
    undefined,
  );
  assert.equal(
    (buildQuotation(customerId, quotationId, quotation).requested_items as Array<Record<string, unknown>>)[0]
      ?.source_quotation_item_id,
    quotationItemId,
  );
});

test("draft parser rejects malformed arrays, empty items, UUIDs, source, date, quantities, and negative or nonfinite money", () => {
  const parse = productionFunction<ParseDraftSaleInput>("parseDraftSaleInput");
  const cases: Array<[string, (form: FormData) => void, RegExp]> = [
    ["items object", (form) => form.set("items", "{}"), /items is invalid/i],
    ["empty items", (form) => form.set("items", "[]"), /at least one product/i],
    ["customer UUID", (form) => form.set("customer_id", "bad"), /customer is invalid/i],
    ["address UUID", (form) => form.set("address_id", "bad"), /delivery address is invalid/i],
    ["product UUID", (form) => form.set("items", JSON.stringify([{ product_id: "bad", warehouse_id: warehouseId, quantity: 1, unit_price: 1 }])), /item 1 product is invalid/i],
    ["source", (form) => form.set("sales_source", "quotation"), /sales source is invalid/i],
    ["date", (form) => form.set("expected_delivery_date", "2026-02-30"), /expected delivery date is invalid/i],
    ["fractional quantity", (form) => form.set("items", JSON.stringify([{ product_id: productId, warehouse_id: warehouseId, quantity: 1.5, unit_price: 1 }])), /whole number/i],
    ["zero quantity", (form) => form.set("items", JSON.stringify([{ product_id: productId, warehouse_id: warehouseId, quantity: 0, unit_price: 1 }])), /quantity/i],
    ["negative price", (form) => form.set("items", JSON.stringify([{ product_id: productId, warehouse_id: warehouseId, quantity: 1, unit_price: -1 }])), /unit price/i],
    ["nonfinite price", (form) => form.set("items", JSON.stringify([{ product_id: productId, warehouse_id: warehouseId, quantity: 1, unit_price: "Infinity" }])), /unit price/i],
    ["negative line discount", (form) => form.set("items", JSON.stringify([{ product_id: productId, warehouse_id: warehouseId, quantity: 1, unit_price: 1, line_discount: -1 }])), /discount/i],
    ["negative line tax", (form) => form.set("items", JSON.stringify([{ product_id: productId, warehouse_id: warehouseId, quantity: 1, unit_price: 1, line_tax: -1 }])), /tax/i],
    ["negative header money", (form) => form.set("tax_amount", "-1"), /VAT \/ tax/i],
  ];
  for (const [name, mutate, expected] of cases) {
    const form = validForm();
    mutate(form);
    assert.throws(() => parse(form, { mode: "manual" }), expected, name);
  }
});

test("all line, header, and adjustment money rejects overflowing or unsafe cents", () => {
  const parse = productionFunction<ParseDraftSaleInput>("parseDraftSaleInput");
  const overflowingMoney = "179769313486231570000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000.00";
  const unsafeDatabaseMoney = "100000000000000.00";
  for (const [name, mutate] of [
    ["unit price", (form: FormData) => form.set("items", JSON.stringify([{ product_id: productId, warehouse_id: warehouseId, quantity: 1, unit_price: overflowingMoney }]))],
    ["line discount", (form: FormData) => form.set("items", JSON.stringify([{ product_id: productId, warehouse_id: warehouseId, quantity: 1, unit_price: 1, line_discount: unsafeDatabaseMoney }]))],
    ["line tax", (form: FormData) => form.set("items", JSON.stringify([{ product_id: productId, warehouse_id: warehouseId, quantity: 1, unit_price: 1, line_tax: overflowingMoney }]))],
    ["header tax", (form: FormData) => form.set("tax_amount", overflowingMoney)],
  ] as const) {
    const form = validForm();
    mutate(form);
    assert.throws(() => parse(form, { mode: "manual" }), /valid amount|supported range/i, name);
  }

  const adjustmentForm = validForm();
  adjustmentForm.set("adjustments", JSON.stringify([{
    order_item_id: null,
    source_quotation_item_id: quotationItemId,
    product_id: productId,
    variation_id: variationId,
    adjustment_type: "manual_unit_price",
    previous_value: overflowingMoney,
    new_value: 10.25,
    reason: "Reviewed",
  }]));
  assert.throws(
    () => parse(adjustmentForm, { mode: "quotation" }),
    /valid amount|supported range/i,
  );
});

test("decimal money rounds exact digit strings to cents without binary drift", () => {
  const normalizeMoney = productionFunction<(value: unknown) => number>(
    "normalizeDraftSaleMoney",
  );
  const cases: Array<[unknown, number]> = [
    ["0", 0],
    ["12", 12],
    ["12.3", 12.3],
    ["12.34", 12.34],
    ["1.234", 1.23],
    ["1.235", 1.24],
    ["1.236", 1.24],
    ["0.004", 0],
    ["0.005", 0.01],
    ["0.006", 0.01],
    [12.345, 12.35],
    ["+12.345", 12.35],
  ];
  for (const [value, expected] of cases) {
    assert.equal(normalizeMoney(value), expected, String(value));
  }

  const exactLarge = normalizeMoney("45035996273704.95");
  assert.equal(exactLarge, 45035996273704.95);
  assert.equal(JSON.stringify(exactLarge), "45035996273704.95");
  assert.notEqual(JSON.stringify(exactLarge), "45035996273704.96");

  const maximum = normalizeMoney("70368744177664.00");
  assert.equal(maximum, 70368744177664);
  assert.equal(JSON.stringify(maximum), "70368744177664");

  const parse = productionFunction<ParseDraftSaleInput>("parseDraftSaleInput");
  const form = validForm();
  form.set("tax_amount", "1.235");
  form.set("items", JSON.stringify([{
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: 1,
    unit_price: 12.345,
  }]));
  const parsed = parse(form, { mode: "manual" });
  assert.equal(parsed.items[0]?.unit_price, 12.35);
  assert.equal(parsed.taxAmount, 1.24);
});

test("decimal money rejects ambiguous cents, database overflow, huge values, signs, exponents, and garbage", () => {
  const normalizeMoney = productionFunction<(value: unknown) => number>(
    "normalizeDraftSaleMoney",
  );
  for (const value of [
    "70368744177664.01",
    "99999999999999.99",
    "100000000000000.00",
    "179769313486231570000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000.00",
    "-0.01",
    "-0",
    "1e2",
    "Infinity",
    "not-money",
    {},
  ]) {
    assert.throws(() => normalizeMoney(value), /valid amount|supported range/i, String(value));
  }
});

test("draft parser rejects invalid adjustment types, values, reasons, existing-item IDs, and mismatched line identifiers", () => {
  const parse = productionFunction<ParseDraftSaleInput>("parseDraftSaleInput");
  const base = {
    order_item_id: null,
    source_quotation_item_id: quotationItemId,
    product_id: productId,
    variation_id: variationId,
    adjustment_type: "manual_unit_price",
    previous_value: 12,
    new_value: 10.25,
    reason: "Reviewed",
  };
  const cases: Array<[string, Record<string, unknown>, RegExp]> = [
    ["type", { ...base, adjustment_type: "line_total" }, /type is invalid/i],
    ["negative", { ...base, new_value: -1 }, /new value/i],
    ["reason", { ...base, reason: "   " }, /reason is required/i],
    ["numeric reason", { ...base, reason: 42 }, /reason is invalid/i],
    ["object reason", { ...base, reason: { text: "Reviewed" } }, /reason is invalid/i],
    ["existing item", { ...base, order_item_id: customerId }, /existing Sale item/i],
    ["wrong product", { ...base, product_id: customerId }, /does not match a Sale line/i],
  ];
  for (const [name, adjustment, expected] of cases) {
    const form = validForm();
    form.set("adjustments", JSON.stringify([adjustment]));
    assert.throws(() => parse(form, { mode: "quotation" }), expected, name);
  }
});

test("unknown JSON text fields are not accepted through string coercion", () => {
  const parse = productionFunction<ParseDraftSaleInput>("parseDraftSaleInput");
  const form = validForm();
  form.set("items", JSON.stringify([{
    product_id: productId,
    variation_id: variationId,
    warehouse_id: warehouseId,
    quantity: 1,
    unit_price: 1,
    adjustment_reason: { text: "Forged" },
  }]));
  assert.throws(() => parse(form, { mode: "manual" }), /adjustment reason is invalid/i);
});

test("unknown conversion RPC results normalize only valid Sale IDs, numbers, and idempotency flags", () => {
  const normalize = productionFunction<(value: unknown) => NormalizedSaleResult>("normalizeConversionSaleResult");
  assert.deepEqual(normalize({
    sale_id: customerId,
    order_id: customerId,
    order_number: "SO-2026-001",
    existing: false,
  }), { saleId: customerId, saleNumber: "SO-2026-001", existing: false });
  assert.deepEqual(normalize({
    sale_id: customerId,
    order_id: customerId,
    order_number: "SO-2026-001",
    existing: true,
  }), { saleId: customerId, saleNumber: "SO-2026-001", existing: true });
  for (const value of [
    customerId,
    null,
    {},
    { sale_id: "bad", order_id: "bad", order_number: "SO-1", existing: false },
    { sale_id: customerId, order_id: productId, order_number: "SO-1", existing: false },
    { sale_id: customerId, order_id: customerId, order_number: "", existing: false },
    { sale_id: customerId, order_id: customerId, order_number: 1234, existing: false },
    { sale_id: customerId, order_id: customerId, order_number: { value: "SO-1" }, existing: false },
    { sale_id: 111, order_id: 111, order_number: "SO-1", existing: false },
    { sale_id: customerId, order_id: customerId, order_number: "SO-1", existing: "false" },
  ]) assert.equal(normalize(value), null);
});

test("conversion action reauthorizes scope, checks eligibility before one atomic RPC, and passes the approved signature", () => {
  const actions = readFileSync("app/admin/sales/actions.ts", "utf8");
  const start = actions.indexOf("export async function createSaleFromQuotationAction");
  assert.notEqual(start, -1, "conversion action must be exported");
  const end = actions.indexOf("export async function", start + 1);
  const body = actions.slice(start, end === -1 ? undefined : end);

  assert.match(body, /requireAllPermissions\(\[\s*\.\.\.QUOTATION_SALE_CONVERSION_PERMISSIONS/);
  assert.match(body, /resolveQuotationViewScope/);
  assert.match(body, /if \(!scope\)/);
  assert.match(body, /uuid\(form\.get\("quotation_id"\), "Quotation"\)/);
  assert.match(body, /parseDraftSaleInput\(form, \{ mode: "quotation" \}\)/);
  assert.match(body, /\.from\("quotation_requests"\)/);
  assert.match(body, /\.eq\("created_by", profile\.id\)/);
  assert.match(body, /create_sale_from_quotation/);
  assert.equal((body.match(/db\.rpc\(/g) ?? []).length, 1);
  assert.match(body, /buildQuotationSaleRpcArguments\(profile\.id, quotationId, input\)/);
  assert.match(body, /normalizeConversionSaleResult\(result\.data\)/);
  assert.match(body, /redirect\(target\(sale\.saleId, "success", "Draft sale created from quotation\."\)\)/);
  assert.doesNotMatch(body, /writeAuditLog|confirm_sales_order|reserve|invoice|stock|shipment|payment/i);
  assert.doesNotMatch(body, /result\.error\?\.message|result\.error\.message/);
});

test("manual create still calls only create_minimal_sale with its established arguments and no quotation input", () => {
  const actions = readFileSync("app/admin/sales/actions.ts", "utf8");
  const start = actions.indexOf("export async function createSaleAction");
  const end = actions.indexOf("export async function", start + 1);
  const body = actions.slice(start, end);
  assert.match(body, /requirePermission\("sales\.create"\)/);
  assert.match(body, /parseDraftSaleInput\(form, \{ mode: "manual" \}\)/);
  assert.equal((body.match(/db\.rpc\(/g) ?? []).length, 1);
  assert.match(body, /db\.rpc\(\s*"create_minimal_sale"/);
  assert.match(body, /buildManualSaleRpcArguments\(profile\.id, input\)/);
  assert.doesNotMatch(body, /quotation_id|create_sale_from_quotation/);
});
