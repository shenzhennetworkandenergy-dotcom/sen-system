import assert from "node:assert/strict";
import test from "node:test";

const stockOut = await import("../lib/inventory/stock-out.ts").catch(() => null);

test("calculates remaining quantity without allowing a negative remainder", () => {
  assert.ok(stockOut, "Stock Out domain helpers must exist.");
  if (!stockOut) return;

  assert.equal(stockOut.stockOutRemaining(10, 6), 4);
  assert.equal(stockOut.stockOutRemaining(5, 5), 0);
  assert.equal(stockOut.stockOutRemaining(5, 7), 0);
});

test("derives pending, partial, and full request status from all request items", () => {
  assert.ok(stockOut, "Stock Out domain helpers must exist.");
  if (!stockOut) return;

  assert.equal(
    stockOut.deriveStockOutStatus([{ required: 5, released: 0 }]),
    "pending_release",
  );
  assert.equal(
    stockOut.deriveStockOutStatus([
      { required: 5, released: 2 },
      { required: 3, released: 3 },
    ]),
    "partially_released",
  );
  assert.equal(
    stockOut.deriveStockOutStatus([
      { required: 5, released: 5 },
      { required: 3, released: 3 },
    ]),
    "fully_released",
  );
  assert.equal(stockOut.deriveStockOutStatus([]), "fully_released");
});

test("rejects invoice revisions below the quantity already physically released", () => {
  assert.ok(stockOut, "Stock Out domain helpers must exist.");
  if (!stockOut) return;

  assert.equal(stockOut.isRevisionQuantityValid(5, 6), false);
  assert.equal(stockOut.isRevisionQuantityValid(6, 6), true);
  assert.equal(stockOut.isRevisionQuantityValid(8, 6), true);
});

test("validates a release against authoritative remaining, reservation, and physical stock", () => {
  assert.ok(stockOut, "Stock Out domain helpers must exist.");
  if (!stockOut) return;

  const validRelease = {
    remaining: 5,
    reserved: 5,
    onHand: 10,
    quantity: 3,
  };

  assert.equal(stockOut.validateReleaseQuantity(validRelease), null);
  assert.equal(
    stockOut.validateReleaseQuantity({ ...validRelease, quantity: 1 }),
    null,
  );
  assert.equal(
    stockOut.validateReleaseQuantity({ ...validRelease, quantity: 5 }),
    null,
  );
  assert.equal(
    stockOut.validateReleaseQuantity({
      remaining: 1,
      reserved: 1,
      onHand: 1,
      quantity: 1,
    }),
    null,
  );
  assert.match(
    stockOut.validateReleaseQuantity({ ...validRelease, quantity: 0 }) ?? "",
    /greater than zero/i,
  );
  assert.match(
    stockOut.validateReleaseQuantity({ ...validRelease, quantity: 6 }) ?? "",
    /remaining/i,
  );
  assert.match(
    stockOut.validateReleaseQuantity({
      ...validRelease,
      reserved: 2,
      quantity: 3,
    }) ?? "",
    /reserved/i,
  );
  assert.match(
    stockOut.validateReleaseQuantity({
      ...validRelease,
      onHand: 2,
      quantity: 3,
    }) ?? "",
    /physical stock/i,
  );
});

test("accepts only eligible serials for the exact product, variation, and warehouse", () => {
  assert.ok(stockOut, "Stock Out domain helpers must exist.");
  if (!stockOut) return;

  const expected = {
    productId: "product-1",
    variationId: "variation-1",
    warehouseId: "warehouse-1",
  };
  const eligibleSerial = {
    productId: "product-1",
    variationId: "variation-1",
    warehouseId: "warehouse-1",
    status: "packed",
    condition: "new",
    conflicting: false,
  };

  assert.equal(stockOut.isEligibleStockOutSerial(eligibleSerial, expected), true);
  assert.equal(
    stockOut.isEligibleStockOutSerial(
      { ...eligibleSerial, warehouseId: "warehouse-2" },
      expected,
    ),
    false,
  );
  assert.equal(
    stockOut.isEligibleStockOutSerial(
      { ...eligibleSerial, productId: "product-2" },
      expected,
    ),
    false,
  );
  assert.equal(
    stockOut.isEligibleStockOutSerial(
      { ...eligibleSerial, status: "damaged", condition: "damaged" },
      expected,
    ),
    false,
  );
  assert.equal(
    stockOut.isEligibleStockOutSerial(
      { ...eligibleSerial, status: "quarantined" },
      expected,
    ),
    false,
  );
  assert.equal(
    stockOut.isEligibleStockOutSerial(
      { ...eligibleSerial, conflicting: true },
      expected,
    ),
    false,
  );
});
