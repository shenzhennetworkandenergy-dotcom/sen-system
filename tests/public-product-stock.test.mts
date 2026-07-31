import assert from "node:assert/strict";
import test from "node:test";

import {
  hasPublicPrice,
  publicStockCount,
  publicStockLabel,
  schemaAvailability,
} from "../lib/catalog/product-display.ts";

test("unavailable products display a zero stock count", () => {
  assert.equal(publicStockCount(0), 0);
  assert.equal(publicStockCount(-4), 0);
  assert.equal(publicStockLabel(0), "Stock: 0");
});

test("available products display their real whole-unit stock count", () => {
  assert.equal(publicStockCount(7.9), 7);
  assert.equal(publicStockLabel(7.9), "Stock: 7");
});

test("price visibility is independent from stock and includes a saved zero price", () => {
  assert.equal(hasPublicPrice(1250), true);
  assert.equal(hasPublicPrice(0), true);
  assert.equal(hasPublicPrice(null), false);
});

test("structured availability distinguishes stock, incoming supply, and unavailable products", () => {
  assert.equal(schemaAvailability(2, 0, false), "https://schema.org/InStock");
  assert.equal(schemaAvailability(0, 3, false), "https://schema.org/PreOrder");
  assert.equal(schemaAvailability(0, 0, true), "https://schema.org/PreOrder");
  assert.equal(schemaAvailability(0, 0, false), "https://schema.org/OutOfStock");
});
