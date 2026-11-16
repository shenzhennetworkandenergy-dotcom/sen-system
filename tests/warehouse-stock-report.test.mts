import assert from "node:assert/strict";
import test from "node:test";
import { summarizeWarehouseStock, type WarehouseStockBalance } from "../lib/inventory/warehouse-report.ts";

const balance: WarehouseStockBalance = {
  product_id: "product",
  variation_id: null,
  on_hand: "2.2500",
  available: "1.0000",
  products: { name: "Switch", sku: "SW", currency: "bdt ", sale_price: "90.50", regular_price: 100 },
  product_variations: null,
};

test("combines stock across locations while keeping each variation and currency separate", () => {
  const report = summarizeWarehouseStock([
    balance,
    { ...balance, on_hand: "0.7500", available: 0.5 },
    {
      ...balance, variation_id: "variant", on_hand: 2, available: 2,
      product_variations: { sku: "SW-24", combination_key: "24 ports", sale_price: null, regular_price: 200 },
    },
    {
      ...balance, product_id: "adapter", on_hand: 0.125, available: 0.125,
      products: { name: "Adapter", sku: "AD", currency: "USD", sale_price: null, regular_price: "4.25" },
    },
    { ...balance, product_id: "empty", on_hand: 0, available: 0 },
  ]);
  assert.equal(report.rows.length, 3);
  assert.equal(report.rows.find((row) => row.id === "product")?.stockValue, 271.5);
  assert.equal(report.rows.find((row) => row.id === "variant")?.stockValue, 400);
  assert.equal(report.onHand, 5.125);
  assert.equal(report.available, 3.625);
  assert.deepEqual(report.totals, [
    { currency: "BDT", amount: 671.5 },
    { currency: "USD", amount: 0.5313 },
  ]);
});

test("counts unpriced stock without inventing a selling price and keeps an explicit zero price", () => {
  const report = summarizeWarehouseStock([
    {
      ...balance,
      products: { ...balance.products, sale_price: null, regular_price: null },
    },
    { ...balance, product_id: "free", products: { ...balance.products, sale_price: 0 } },
    {
      ...balance, variation_id: "fallback",
      product_variations: { sku: "SW-12", combination_key: "12 ports", sale_price: null, regular_price: null },
    },
  ]);
  assert.equal(report.rows.find((row) => row.id === "product")?.unitPrice, null);
  assert.equal(report.rows.find((row) => row.id === "free")?.unitPrice, 0);
  assert.equal(report.rows.find((row) => row.id === "fallback")?.unitPrice, 90.5);
  assert.equal(report.unpriced, 1);
  assert.deepEqual(report.totals, [{ currency: "BDT", amount: 203.625 }]);
});
