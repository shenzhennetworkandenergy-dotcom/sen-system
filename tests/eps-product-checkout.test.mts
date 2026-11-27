import assert from "node:assert/strict";
import test from "node:test";
import { epsProductResumePath, epsProductTotal, safeEpsProductResume } from "../lib/orders/eps-product-checkout.ts";

test("sign-in preserves the selected configuration and quantity on the same site", () => {
  const selected = { quantity: 3, variationId: "2a6f9bd2-33e8-4970-a915-3773e046fecb" };
  const path = epsProductResumePath("test-network-adapter", selected);
  assert.equal(path, "/products/test-network-adapter?buy=1&qty=3&variation=2a6f9bd2-33e8-4970-a915-3773e046fecb#purchase");
  assert.equal(safeEpsProductResume(path), path);
  for (const invalid of [
    "//another.example/products/demo?buy=1&qty=3", "/admin?buy=1&qty=3",
    "/products/%2e%2e?buy=1&qty=3", "/products/demo?buy=1&qty=100",
    "/products/demo?buy=1&qty=1.5", "/products/demo?buy=1&qty=3&variation=bad",
  ]) assert.equal(safeEpsProductResume(invalid), null);
});

test("direct checkout matches the database by rounding unit price before extending quantity", () => {
  assert.equal(epsProductTotal(120.5, 2), "241.00");
  assert.equal(epsProductTotal(1.005, 3), "3.03");
  assert.equal(epsProductTotal(0.004, 99), null);
  assert.equal(epsProductTotal(1, 0), null);
  assert.equal(epsProductTotal(null, 2), null);
});
