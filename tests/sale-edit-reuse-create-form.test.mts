import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildSaleBuilderSubmission,
  createSaleBuilderInitialState,
  type SaleBuilderRow,
  type SaleEditInitial,
} from "../components/sales/sale-builder-state.ts";
import {
  assertSaleCustomerLocked,
  parseDraftSaleEditItems,
} from "../lib/sales/draft-sale-editing.ts";

const saleId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";
const warehouseId = "33333333-3333-4333-8333-333333333333";
const firstLineId = "44444444-4444-4444-8444-444444444444";
const removedLineId = "55555555-5555-4555-8555-555555555555";
const firstProductId = "66666666-6666-4666-8666-666666666666";
const replacementProductId = "77777777-7777-4777-8777-777777777777";
const addedProductId = "88888888-8888-4888-8888-888888888888";

const initialSale: SaleEditInitial = {
  saleId,
  orderNumber: "SO-TEST-1",
  updatedAt: "2026-10-14T08:00:00.000Z",
  customerId,
  warehouseId,
  addressId: null,
  billingAddressId: null,
  shippingAddressLabel: "Synthetic shipping address",
  billingAddressLabel: "Synthetic billing address",
  salesSource: "direct_office",
  expectedDeliveryDate: null,
  discountAmount: 0,
  shippingAmount: 0,
  serviceAmount: 0,
  taxAmount: 0,
  customerNotes: null,
  internalNotes: null,
  items: [
    {
      id: firstLineId,
      productId: firstProductId,
      variationId: null,
      quantity: 2,
      unitPrice: 100,
      discountType: "fixed",
      discountValue: 5,
      lineDiscount: 5,
      lineTax: 0,
    },
    {
      id: removedLineId,
      productId: addedProductId,
      variationId: null,
      quantity: 1,
      unitPrice: 20,
      discountType: "percentage",
      discountValue: 10,
      lineDiscount: 2,
      lineTax: 0,
    },
  ],
};

test("Edit Sale pre-fills the existing Create Sale builder", () => {
  const state = createSaleBuilderInitialState(
    undefined,
    [{ id: warehouseId }],
    () => "unused",
    initialSale,
  );

  assert.equal(state.customerId, customerId);
  assert.equal(state.warehouseId, warehouseId);
  assert.equal(state.rows.length, 2);
  assert.equal(state.rows[0].sale_order_item_id, firstLineId);
  assert.equal(state.rows[0].line_discount, "5");
  assert.equal(state.rows[1].discount_percent, "10");
});

test("submission supports replace, remove-by-omission, add, quantity, price, and discounts", () => {
  const rows: SaleBuilderRow[] = [
    {
      key: "retained-and-replaced",
      sale_order_item_id: firstLineId,
      product_id: replacementProductId,
      variation_id: "",
      source_quotation_item_id: null,
      quantity: "3",
      unit_price: "90",
      line_discount: "0",
      discount_percent: "10",
      line_tax: "0",
      reason: "Approved synthetic edit",
      catalogue_price: 90,
      baseline_unit_price: 100,
      baseline_line_discount: 5,
    },
    {
      key: "new",
      sale_order_item_id: null,
      product_id: addedProductId,
      variation_id: "",
      source_quotation_item_id: null,
      quantity: "2",
      unit_price: "25",
      line_discount: "3",
      discount_percent: "0",
      line_tax: "0",
      reason: "Approved synthetic edit",
      catalogue_price: 25,
      baseline_unit_price: 25,
      baseline_line_discount: 0,
    },
  ];

  const result = buildSaleBuilderSubmission(
    rows,
    warehouseId,
    new Set([replacementProductId, addedProductId]),
    undefined,
    { discountAmount: "0", serviceAmount: "0", discountReason: "" },
    initialSale,
  );

  assert.equal(result.mode, "manual");
  assert.deepEqual(result.items.map((item) => item.id), [firstLineId, null]);
  assert.equal(result.items.some((item) => item.id === removedLineId), false);
  assert.deepEqual(result.items.map((item) => ({
    product: item.product_id,
    quantity: item.quantity,
    price: item.unit_price,
    discountType: item.discount_type,
    discountValue: item.discount_value,
  })), [
    { product: replacementProductId, quantity: 3, price: 90, discountType: "percentage", discountValue: 10 },
    { product: addedProductId, quantity: 2, price: 25, discountType: "fixed", discountValue: 3 },
  ]);
});

test("server input validation locks customer and requires one valid line", () => {
  assert.doesNotThrow(() => assertSaleCustomerLocked(customerId, customerId));
  assert.throws(
    () => assertSaleCustomerLocked(saleId, customerId),
    /customer cannot be changed/i,
  );
  assert.throws(() => parseDraftSaleEditItems([]), /at least one product/i);

  const parsed = parseDraftSaleEditItems([{
    id: firstLineId,
    product_id: replacementProductId,
    variation_id: null,
    warehouse_id: warehouseId,
    quantity: 3,
    unit_price: 90,
    discount_type: "percentage",
    discount_value: 10,
  }]);
  assert.equal(parsed[0].id, firstLineId);
  assert.throws(
    () => parseDraftSaleEditItems([{ ...parsed[0], quantity: 1.5 }]),
    /whole number/i,
  );
  assert.throws(
    () => parseDraftSaleEditItems([{ ...parsed[0], discount_value: 101 }]),
    /cannot exceed 100/i,
  );
});

test("database update remains Draft-only, permissioned, atomic, and preserves physical fulfilment state", () => {
  const migration = readFileSync(
    "supabase/migrations/202610140001_draft_sale_builder_editing.sql",
    "utf8",
  );
  assert.match(migration, /assert_actor_permission\(actor_profile_id,'sales\.edit'\)/);
  assert.match(migration, /sale\.status<>'draft' or sale\.confirmed_at is not null/);
  assert.match(migration, /jsonb_array_length\(requested_items\)=0/);
  assert.match(migration, /inventory_reservations where order_id=sale\.id/);
  assert.match(migration, /order_serial_allocations where order_id=sale\.id/);
  assert.match(migration, /shipments where order_id=sale\.id/);
  assert.match(migration, /delete from public\.sales_order_items/);
  assert.match(migration, /insert into public\.sales_order_items/);
  assert.match(migration, /subtotal=subtotal_total,total_amount=revised_total/);
  assert.match(migration, /revised_total<sale\.paid_amount/);
  assert.match(migration, /grant execute on function public\.update_draft_sale_products/);
});

test("details and action layers enforce the Draft-only edit boundary", () => {
  const details = readFileSync("app/admin/sales/[saleId]/page.tsx", "utf8");
  const editPage = readFileSync("app/admin/sales/[saleId]/edit/page.tsx", "utf8");
  const actions = readFileSync("app/admin/sales/actions.ts", "utf8");
  assert.match(details, /status === "draft"/);
  assert.match(details, /Edit Sale/);
  assert.match(editPage, /requirePermission\("sales\.edit"\)/);
  assert.match(editPage, /data\.order\.status !== "draft"/);
  assert.match(actions, /assertSaleCustomerLocked/);
  assert.match(actions, /update_draft_sale_products/);
});
