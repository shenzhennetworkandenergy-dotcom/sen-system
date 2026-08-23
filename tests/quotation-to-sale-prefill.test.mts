import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import type { QuotationSaleInitial } from "../lib/quotations/sale-conversion-types.ts";

const statePath = "components/sales/sale-builder-state.ts";
const stateModule = existsSync(statePath)
  ? await import("../components/sales/sale-builder-state.ts")
  : ({} as Record<string, unknown>);

const customerId = "11111111-1111-4111-8111-111111111111";
const warehouseId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";
const variationId = "44444444-4444-4444-8444-444444444444";
const quotationId = "55555555-5555-4555-8555-555555555555";
const quotationItemId = "66666666-6666-4666-8666-666666666666";
const shippingAddressId = "77777777-7777-4777-8777-777777777777";
const billingAddressId = "88888888-8888-4888-8888-888888888888";

const quotation: QuotationSaleInitial = {
  quotationId,
  reference: "QT-20260823-ZERO",
  customerId,
  billingAddressId,
  shippingAddressId,
  expectedDeliveryDate: "2026-09-05",
  discountAmount: 4.25,
  taxAmount: 1.75,
  customerNotes: "Customer note",
  internalNotes: "Internal note",
  paymentTerms: "Net 30",
  deliveryInformation: "Weekday delivery",
  termsAndConditions: "Approved terms",
  lines: [{
    quotationItemId,
    productId,
    variationId,
    quantity: 2,
    unitPrice: 0,
    lineDiscount: 0,
    lineTax: 0.75,
  }],
};

function productionFunction<T extends (...args: never[]) => unknown>(name: string) {
  const candidate = (stateModule as Record<string, unknown>)[name];
  assert.equal(typeof candidate, "function", `${name} must be exported`);
  return candidate as T;
}

test("manual SaleBuilder initialization retains its established empty defaults", () => {
  const initialize = productionFunction<(
    initial: QuotationSaleInitial | undefined,
    warehouses: Array<{ id: string }>,
    makeKey: () => string,
  ) => Record<string, unknown>>("createSaleBuilderInitialState");

  assert.deepEqual(initialize(undefined, [{ id: warehouseId }], () => "manual-row"), {
    customerId: "",
    warehouseId,
    addressId: "",
    billingAddressId: "",
    rows: [{
      key: "manual-row",
      product_id: "",
      variation_id: "",
      source_quotation_item_id: null,
      quantity: "1",
      unit_price: "0",
      line_discount: "0",
      discount_percent: "0",
      line_tax: "0",
      reason: "",
      catalogue_price: 0,
      baseline_unit_price: 0,
      baseline_line_discount: 0,
    }],
    expectedDeliveryDate: "",
    discountAmount: "0",
    shippingAmount: "0",
    serviceAmount: "0",
    taxAmount: "0",
    discountReason: "",
    customerNotes: "",
    internalNotes: "",
  });
});

test("quotation initialization preserves exact IDs, zero price, tax, dates, notes, and approved baselines", () => {
  const initialize = productionFunction<(
    initial: QuotationSaleInitial,
    warehouses: Array<{ id: string }>,
    makeKey: () => string,
  ) => Record<string, unknown>>("createSaleBuilderInitialState");

  assert.deepEqual(initialize(quotation, [{ id: warehouseId }], () => "unused"), {
    customerId,
    warehouseId,
    addressId: shippingAddressId,
    billingAddressId,
    rows: [{
      key: `quotation:${quotationItemId}`,
      product_id: productId,
      variation_id: variationId,
      source_quotation_item_id: quotationItemId,
      quantity: "2",
      unit_price: "0",
      line_discount: "0",
      discount_percent: "0",
      line_tax: "0.75",
      reason: "Approved quotation QT-20260823-ZERO",
      catalogue_price: 0,
      baseline_unit_price: 0,
      baseline_line_discount: 0,
    }],
    expectedDeliveryDate: "2026-09-05",
    discountAmount: "4.25",
    shippingAmount: "0",
    serviceAmount: "0",
    taxAmount: "1.75",
    discountReason: "Approved quotation QT-20260823-ZERO",
    customerNotes: "Customer note",
    internalNotes: "Internal note",
  });
});

test("quotation submission carries exact line tax and an explicit empty adjustment array when unchanged", () => {
  const initialize = productionFunction<(
    initial: QuotationSaleInitial,
    warehouses: Array<{ id: string }>,
    makeKey: () => string,
  ) => { rows: Array<Record<string, unknown>>; discountAmount: string; serviceAmount: string }>(
    "createSaleBuilderInitialState",
  );
  const submission = productionFunction<(
    rows: Array<Record<string, unknown>>,
    warehouse: string,
    validProducts: Set<string>,
    initial: QuotationSaleInitial,
    header: { discountAmount: string; serviceAmount: string; discountReason: string },
  ) => Record<string, unknown>>("buildSaleBuilderSubmission");
  const state = initialize(quotation, [{ id: warehouseId }], () => "unused");

  assert.deepEqual(
    submission(state.rows, warehouseId, new Set([productId]), quotation, {
      discountAmount: state.discountAmount,
      serviceAmount: state.serviceAmount,
      discountReason: "Approved quotation QT-20260823-ZERO",
    }),
    {
      mode: "quotation",
      quotationId,
      items: [{
        product_id: productId,
        variation_id: variationId,
        warehouse_id: warehouseId,
        source_quotation_item_id: quotationItemId,
        quantity: 2,
        unit_price: 0,
        line_discount: 0,
        line_tax: 0.75,
        price_overridden: false,
        catalogue_price: 0,
        adjustment_reason: "Approved quotation QT-20260823-ZERO",
      }],
      adjustments: [],
    },
  );
});

test("quotation adjustments exactly describe sourced edits, header edits, service, and added-line edits", () => {
  const submission = productionFunction<(
    rows: Array<Record<string, unknown>>,
    warehouse: string,
    validProducts: Set<string>,
    initial: QuotationSaleInitial,
    header: { discountAmount: string; serviceAmount: string; discountReason: string },
  ) => { adjustments: unknown[] }>("buildSaleBuilderSubmission");
  const addedProductId = "99999999-9999-4999-8999-999999999999";
  const reason = "Approved quotation QT-20260823-ZERO";
  const result = submission([
    {
      key: "source",
      product_id: productId,
      variation_id: variationId,
      source_quotation_item_id: quotationItemId,
      quantity: "3",
      unit_price: "2.25",
      line_discount: "0.5",
      discount_percent: "0",
      line_tax: "0.75",
      reason,
      catalogue_price: 0,
      baseline_unit_price: 0,
      baseline_line_discount: 1.5,
    },
    {
      key: "added",
      product_id: addedProductId,
      variation_id: "",
      source_quotation_item_id: null,
      quantity: "1",
      unit_price: "9",
      line_discount: "1",
      discount_percent: "10",
      line_tax: "0",
      reason,
      catalogue_price: 10,
      baseline_unit_price: 10,
      baseline_line_discount: 0,
    },
  ], warehouseId, new Set([productId, addedProductId]), quotation, {
    discountAmount: "5",
    serviceAmount: "3",
    discountReason: reason,
  });

  assert.deepEqual(result.adjustments, [
    {
      order_item_id: null,
      source_quotation_item_id: quotationItemId,
      product_id: productId,
      variation_id: variationId,
      adjustment_type: "manual_unit_price",
      previous_value: 0,
      new_value: 2.25,
      reason,
    },
    {
      order_item_id: null,
      source_quotation_item_id: quotationItemId,
      product_id: productId,
      variation_id: variationId,
      adjustment_type: "fixed_line_discount",
      previous_value: 1.5,
      new_value: 0.5,
      reason,
    },
    {
      order_item_id: null,
      source_quotation_item_id: null,
      product_id: addedProductId,
      variation_id: null,
      adjustment_type: "manual_unit_price",
      previous_value: 10,
      new_value: 9,
      reason,
    },
    {
      order_item_id: null,
      source_quotation_item_id: null,
      product_id: addedProductId,
      variation_id: null,
      adjustment_type: "fixed_line_discount",
      previous_value: 10,
      new_value: 1.9,
      reason,
    },
    {
      order_item_id: null,
      source_quotation_item_id: null,
      product_id: null,
      variation_id: null,
      adjustment_type: "order_discount",
      previous_value: 4.25,
      new_value: 5,
      reason,
    },
    {
      order_item_id: null,
      source_quotation_item_id: null,
      product_id: null,
      variation_id: null,
      adjustment_type: "service_charge",
      previous_value: 0,
      new_value: 3,
      reason,
    },
  ]);
});

test("SaleBuilder wiring selects the conversion action only for quotation mode and exposes no import mutation", () => {
  const builder = readFileSync("components/sales/SaleBuilder.tsx", "utf8");
  assert.match(builder, /initialQuotation\?:\s*QuotationSaleInitial/);
  assert.match(builder, /initialQuotation\s*\?\s*createSaleFromQuotationAction\s*:\s*createSaleAction/);
  assert.match(builder, /name="quotation_id"/);
  assert.match(builder, /name="adjustments"/);
  assert.match(builder, /locked=\{Boolean\(initialQuotation\)\}/);
  assert.match(builder, /Line tax/);
  assert.doesNotMatch(builder, /useEffect|confirmSaleAction|confirm_sales_order|reserve|invoice|inventory|stock[_A-Z]|shipment/i);
});

test("locked customer and page/entry contracts preserve manual mode and authorize quotation mode", () => {
  const customerTypeahead = readFileSync("components/customers/CustomerTypeahead.tsx", "utf8");
  const newPage = readFileSync("app/admin/sales/new/page.tsx", "utf8");
  const listPage = readFileSync("app/admin/sales/page.tsx", "utf8");
  const summary = readFileSync("components/sales/SourceQuotationSummary.tsx", "utf8");

  assert.match(customerTypeahead, /locked\?:\s*boolean/);
  assert.match(customerTypeahead, /locked\s*=\s*false/);
  assert.match(customerTypeahead, /readOnly/);
  assert.match(customerTypeahead, /customerOptionLabel\(selectedCustomer\)/);
  assert.match(newPage, /searchParams:\s*Promise/);
  assert.match(newPage, /await searchParams/);
  assert.match(newPage, /requirePermission\("sales\.create"\)/);
  assert.match(newPage, /requireAllPermissions/);
  assert.match(newPage, /loadQuotationSaleInitial/);
  assert.match(newPage, /<SourceQuotationSummary/);
  assert.match(newPage, /initialQuotation=\{initialQuotation\}/);
  assert.match(listPage, /permissions\.has\("sales\.create"\)/);
  assert.match(listPage, /permissions\.has\("quotations\.convert_to_sale"\)/);
  assert.match(listPage, /Create Sale from Quotation/);
  assert.match(summary, /Payment terms/);
  assert.match(summary, /Delivery information/);
  assert.match(summary, /Terms and conditions/);
  assert.doesNotMatch(newPage + summary, /createSaleAction\(|createSaleFromQuotationAction\(|\.rpc\(|\.insert\(|\.update\(/);
});
