import assert from "node:assert/strict";
import test from "node:test";

type Visibility = {
  deliveryDetails: boolean;
  variation: boolean;
  lineDiscounts: boolean;
  orderAdjustments: boolean;
};

type VisibilityModule = {
  createSaleFieldVisibility: (role: "admin" | "employee") => Visibility;
};

let visibilityModule: VisibilityModule | undefined;
try {
  visibilityModule = await import("../components/sales/sale-builder-visibility.ts");
} catch {
  // The first TDD run intentionally reaches this branch before the policy exists.
}

test("Employee Create Sale hides every restricted field group", () => {
  assert.ok(visibilityModule, "Create Sale role visibility policy must exist");
  assert.deepEqual(visibilityModule.createSaleFieldVisibility("employee"), {
    deliveryDetails: false,
    variation: false,
    lineDiscounts: false,
    orderAdjustments: false,
  });
});

test("Admin Create Sale keeps every existing field group visible", () => {
  assert.ok(visibilityModule, "Create Sale role visibility policy must exist");
  assert.deepEqual(visibilityModule.createSaleFieldVisibility("admin"), {
    deliveryDetails: true,
    variation: true,
    lineDiscounts: true,
    orderAdjustments: true,
  });
});
