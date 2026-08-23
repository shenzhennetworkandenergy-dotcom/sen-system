import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import * as conversion from "../lib/quotations/sale-conversion-types.ts";

const source = (path: string) => readFileSync(path, "utf8");
const validUuid = "11111111-1111-4111-8111-111111111111";
const customerUuid = "22222222-2222-4222-8222-222222222222";
const productUuid = "33333333-3333-4333-8333-333333333333";
const shippingUuid = "44444444-4444-4444-8444-444444444444";
const billingUuid = "55555555-5555-4555-8555-555555555555";

function conversionFunction<T extends (...args: never[]) => unknown>(name: string) {
  const candidate = (conversion as Record<string, unknown>)[name];
  assert.equal(typeof candidate, "function", `${name} must be exported`);
  return candidate as T;
}

const quotationFixture = {
  id: validUuid,
  reference: "QT-20260823-ABCD",
  profile_id: customerUuid,
  billing_address_id: billingUuid,
  shipping_address_id: shippingUuid,
  required_by: "2026-08-31",
  discount_amount: "4.25",
  tax_amount: "1.75",
  customer_notes: "Customer note",
  internal_notes: "Internal note",
  payment_terms: "Net 30",
  delivery_information: "Weekday delivery",
  terms_and_conditions: "Terms",
};

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
  assert.match(
    loader,
    /profiles!quotation_requests_profile_id_fkey!inner\(id,role,status\)/,
  );
  assert.doesNotMatch(loader, /profiles!inner/);
  assert.match(loader, /\.eq\("profiles\.role", "customer"\)/);
  assert.match(loader, /\.eq\("profiles\.status", "active"\)/);
  assert.match(loader, /quotation_request_items/);
  assert.match(loader, /target_price/);
  assert.match(loader, /customer_addresses/);
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
  assert.match(typeahead, /quotationSaleDestination\(option\.quotationId\)/);
  assert.match(typeahead, /option\.reference/);
  assert.match(typeahead, /option\.customerName/);
  assert.match(typeahead, /option\.customerCompany/);
  assert.match(typeahead, /option\.totalAmount/);
  assert.match(typeahead, /let active = true/);
  assert.match(typeahead, /return \(\) => \{/);
  assert.match(typeahead, /aria-activedescendant/);
  assert.match(typeahead, /activeIndex === index/);
  assert.match(typeahead, /bg-blue-100/);
  assert.match(typeahead, /option\.customerEmail \? `\$\{option\.customerEmail\} · ` : ""/);
  assert.doesNotMatch(typeahead, /error\.message/);
});

test("prefill eligibility requires an active customer and respects the date-only expiry boundary", () => {
  const isEligible = conversionFunction<
    (value: unknown, today: string) => boolean
  >("isEligibleQuotationSalePrefill");

  assert.equal(
    isEligible(
      {
        status: "accepted",
        expirationDate: "2026-08-23",
        convertedOrderId: null,
        customerRole: "customer",
        customerStatus: "active",
      },
      "2026-08-23",
    ),
    true,
  );
  assert.equal(
    isEligible(
      {
        status: "accepted",
        expirationDate: "2026-08-22",
        convertedOrderId: null,
        customerRole: "customer",
        customerStatus: "active",
      },
      "2026-08-23",
    ),
    false,
  );
  assert.equal(
    isEligible(
      {
        status: "accepted",
        expirationDate: null,
        convertedOrderId: null,
        customerRole: "employee",
        customerStatus: "active",
      },
      "2026-08-23",
    ),
    false,
  );
  assert.equal(
    isEligible(
      {
        status: "accepted",
        expirationDate: null,
        convertedOrderId: null,
        customerRole: "customer",
        customerStatus: "inactive",
      },
      "2026-08-23",
    ),
    false,
  );
});

test("prefill mapping preserves zero-priced quotation lines and only falls back to target price when unit price is null", () => {
  const normalizeInitial = conversionFunction<
    (quotation: unknown, items: unknown) => unknown
  >("normalizeQuotationSaleInitial");

  const initial = normalizeInitial(quotationFixture, [
    {
      id: "66666666-6666-4666-8666-666666666666",
      product_id: productUuid,
      variation_id: null,
      quantity: "2",
      unit_price: "40.00",
      target_price: "30.00",
      discount_amount: "3.00",
      tax_amount: "1.50",
    },
    {
      id: "77777777-7777-4777-8777-777777777777",
      product_id: productUuid,
      variation_id: null,
      quantity: 1,
      unit_price: null,
      target_price: "37.50",
      discount_amount: null,
      tax_amount: null,
    },
  ]) as { lines: Array<{ unitPrice: number; lineDiscount: number; lineTax: number }> };

  assert.deepEqual(initial.lines.map(({ unitPrice, lineDiscount, lineTax }) => ({
    unitPrice,
    lineDiscount,
    lineTax,
  })), [
    { unitPrice: 40, lineDiscount: 3, lineTax: 1.5 },
    { unitPrice: 37.5, lineDiscount: 0, lineTax: 0 },
  ]);
  const zeroPrices = normalizeInitial(quotationFixture, [
    {
      id: "66666666-6666-4666-8666-666666666666",
      product_id: productUuid,
      variation_id: null,
      quantity: 1,
      unit_price: 0,
      target_price: 37.5,
      discount_amount: 0,
      tax_amount: 0,
    },
    {
      id: "77777777-7777-4777-8777-777777777777",
      product_id: productUuid,
      variation_id: null,
      quantity: 1,
      unit_price: null,
      target_price: 0,
      discount_amount: 0,
      tax_amount: 0,
    },
  ]) as { lines: Array<{ unitPrice: number }> };
  assert.deepEqual(zeroPrices.lines.map((line) => line.unitPrice), [0, 0]);
});

test("prefill rejects fractional, zero, negative, and nonfinite quantities while accepting whole positive quantities", () => {
  const normalizeInitial = conversionFunction<
    (quotation: unknown, items: unknown) => unknown
  >("normalizeQuotationSaleInitial");
  const item = {
    id: "66666666-6666-4666-8666-666666666666",
    product_id: productUuid,
    variation_id: null,
    unit_price: 1,
    target_price: 1,
    discount_amount: 0,
    tax_amount: 0,
  };

  assert.notEqual(normalizeInitial(quotationFixture, [{ ...item, quantity: 2 }]), null);
  for (const quantity of [1.5, 0, -1, Number.POSITIVE_INFINITY, "not-a-number"]) {
    assert.equal(
      normalizeInitial(quotationFixture, [{ ...item, quantity }]),
      null,
      `quantity ${quantity} must be rejected`,
    );
  }
});

test("prefill address ownership rejects foreign shipping or billing IDs and retains null addresses", () => {
  const normalizeInitial = conversionFunction<
    (quotation: unknown, items: unknown) => unknown
  >("normalizeQuotationSaleInitial");
  const validateAddresses = conversionFunction<
    (initial: unknown, ownedAddressIds: unknown) => unknown
  >("validateQuotationSaleAddresses");
  const items = [{
    id: "66666666-6666-4666-8666-666666666666",
    product_id: productUuid,
    variation_id: null,
    quantity: 1,
    unit_price: 1,
    target_price: null,
    discount_amount: 0,
    tax_amount: 0,
  }];
  const initial = normalizeInitial(quotationFixture, items);

  assert.notEqual(validateAddresses(initial, [shippingUuid, billingUuid]), null);
  assert.equal(validateAddresses(initial, [shippingUuid]), null);
  assert.equal(validateAddresses(initial, [billingUuid]), null);
  const noAddresses = normalizeInitial(
    { ...quotationFixture, billing_address_id: null, shipping_address_id: null },
    items,
  );
  assert.notEqual(validateAddresses(noAddresses, []), null);
});

test("RPC normalization rejects malformed rows, caps valid results, and builds only safe destinations", () => {
  const normalizeOptions = conversionFunction<(payload: unknown) => unknown>(
    "normalizeEligibleQuotationOptions",
  );
  const destination = conversionFunction<(quotationId: unknown) => unknown>(
    "quotationSaleDestination",
  );
  const validRow = {
    quotation_id: validUuid,
    reference: "QT-EXACT",
    customer_id: customerUuid,
    customer_name: "Amina Rahman",
    customer_company: "SEN Test",
    customer_email: "amina@example.com",
    total_amount: "12.50",
    currency: "BDT",
    expiration_date: "2026-08-31",
  };
  const options = normalizeOptions([
    validRow,
    null,
    { ...validRow, quotation_id: "not-a-uuid" },
    { ...validRow, total_amount: "not-money" },
    ...Array.from({ length: 22 }, (_, index) => ({
      ...validRow,
      quotation_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      reference: `QT-${index}`,
    })),
  ]) as Array<{ quotationId: string; totalAmount: number }>;

  assert.equal(options.length, 20);
  assert.deepEqual(options[0], {
    quotationId: validUuid,
    reference: "QT-EXACT",
    customerId: customerUuid,
    customerName: "Amina Rahman",
    customerCompany: "SEN Test",
    customerEmail: "amina@example.com",
    totalAmount: 12.5,
    currency: "BDT",
    expirationDate: "2026-08-31",
  });
  assert.equal(destination(validUuid), `/admin/sales/new?quotation=${validUuid}`);
  assert.equal(destination("not-a-uuid"), null);
  assert.deepEqual(
    normalizeOptions([{ ...validRow, customer_email: null }]),
    [{
      quotationId: validUuid,
      reference: "QT-EXACT",
      customerId: customerUuid,
      customerName: "Amina Rahman",
      customerCompany: "SEN Test",
      customerEmail: "",
      totalAmount: 12.5,
      currency: "BDT",
      expirationDate: "2026-08-31",
    }],
  );
  assert.deepEqual(
    normalizeOptions([{ ...validRow, customer_email: "   " }]),
    [{
      quotationId: validUuid,
      reference: "QT-EXACT",
      customerId: customerUuid,
      customerName: "Amina Rahman",
      customerCompany: "SEN Test",
      customerEmail: "",
      totalAmount: 12.5,
      currency: "BDT",
      expirationDate: "2026-08-31",
    }],
  );
});

test("typeahead key behavior wraps active options and exposes selection or close intent", () => {
  const keyResult = conversionFunction<
    (key: unknown, activeIndex: unknown, optionCount: unknown) => unknown
  >("quotationTypeaheadKeyResult");

  assert.deepEqual(keyResult("ArrowDown", -1, 3), {
    activeIndex: 0,
    select: false,
    close: false,
  });
  assert.deepEqual(keyResult("ArrowUp", 0, 3), {
    activeIndex: 2,
    select: false,
    close: false,
  });
  assert.deepEqual(keyResult("Enter", 1, 3), {
    activeIndex: 1,
    select: true,
    close: false,
  });
  assert.deepEqual(keyResult("Escape", 1, 3), {
    activeIndex: -1,
    select: false,
    close: true,
  });
});

test("typeahead search transitions clear stale choices and ignore stale responses", () => {
  const transition = conversionFunction<
    (state: unknown, event: unknown) => unknown
  >("quotationTypeaheadStateTransition");
  const option = {
    quotationId: validUuid,
    reference: "QT-EXACT",
    customerId: customerUuid,
    customerName: "Amina Rahman",
    customerCompany: null,
    customerEmail: "",
    totalAmount: 12.5,
    currency: "BDT",
    expirationDate: "2026-08-31",
  };
  const seeded = {
    options: [option],
    activeIndex: 0,
    loading: true,
    error: "Old search failed.",
    requestId: 4,
  };

  const queryReset = transition(seeded, { type: "query", requestId: 5 });
  assert.deepEqual(queryReset, {
    options: [],
    activeIndex: -1,
    loading: false,
    error: null,
    requestId: 5,
  });
  const response = transition(queryReset, {
    type: "response",
    requestId: 5,
    options: [option],
    error: null,
  });
  assert.deepEqual(response, {
    options: [option],
    activeIndex: -1,
    loading: false,
    error: null,
    requestId: 5,
  });
  const escape = transition(response, { type: "escape", requestId: 6 });
  assert.deepEqual(escape, {
    options: [],
    activeIndex: -1,
    loading: false,
    error: null,
    requestId: 6,
  });
  assert.deepEqual(
    transition(escape, {
      type: "response",
      requestId: 5,
      options: [option],
      error: null,
    }),
    escape,
  );
});

test("typeahead response replacement resets active state for empty and smaller option sets", () => {
  const transition = conversionFunction<
    (state: unknown, event: unknown) => unknown
  >("quotationTypeaheadStateTransition");
  const keyResult = conversionFunction<
    (key: unknown, activeIndex: unknown, optionCount: unknown) => unknown
  >("quotationTypeaheadKeyResult");
  const state = {
    options: Array.from({ length: 3 }, (_, index) => ({
      quotationId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      reference: `QT-${index}`,
      customerId: customerUuid,
      customerName: "Amina Rahman",
      customerCompany: null,
      customerEmail: "",
      totalAmount: 1,
      currency: "BDT",
      expirationDate: null,
    })),
    activeIndex: 2,
    loading: true,
    error: null,
    requestId: 8,
  };

  const one = transition(state, {
    type: "response",
    requestId: 8,
    options: state.options.slice(0, 1),
    error: null,
  }) as { activeIndex: number; options: unknown[] };
  assert.equal(one.activeIndex, -1);
  assert.equal(one.options.length, 1);
  const empty = transition(one, {
    type: "response",
    requestId: 8,
    options: [],
    error: null,
  }) as { activeIndex: number; options: unknown[] };
  assert.equal(empty.activeIndex, -1);
  assert.equal(empty.options.length, 0);
  assert.deepEqual(keyResult("Enter", 4, 1), {
    activeIndex: -1,
    select: false,
    close: false,
  });
});
