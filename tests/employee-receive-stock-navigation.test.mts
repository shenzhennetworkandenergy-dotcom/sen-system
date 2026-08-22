import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";

type ResolveHook = (
  specifier: string,
  context: object,
  nextResolve: (specifier: string, context: object) => object,
) => object;

const registerHooks = (nodeModule as unknown as {
  registerHooks: (hooks: { resolve: ResolveHook }) => void;
}).registerHooks;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(
        new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href,
        context,
      );
    }
    return nextResolve(specifier, context);
  },
});

const navigation = await import("../lib/navigation/dashboard.ts");

test("Receive Stock appears for an employee granted inventory.receive_new_stock", () => {
  const item = navigation
    .visibleEmployeeNavigation(["inventory.receive_new_stock"])
    .find((entry) => entry.key === "receive-new-stock");

  assert.ok(item, "Receive Stock must be present in Employee navigation");
  assert.equal(item.route, "/employee/inventory/receive");
});

test("Receive Stock remains hidden from employees without its permission", () => {
  const keys = navigation.visibleEmployeeNavigation([]).map((item) => item.key);
  assert.equal(keys.includes("receive-new-stock"), false);
});

test("Employee dashboard maps the Inventory module to Receive Stock", () => {
  assert.equal(
    typeof navigation.employeeModuleRouteMap,
    "function",
    "Employee dashboard module route mapping must exist",
  );
  const routes = navigation.employeeModuleRouteMap(["inventory.receive_new_stock"]);
  assert.equal(routes.get("inventory"), "/employee/inventory/receive");
});

test("Admin navigation never includes the Employee-only Receive Stock shortcut", () => {
  assert.equal(
    navigation.adminNavigation.some((item) => item.key === "receive-new-stock"),
    false,
  );
});

test("Stock Out is independently permissioned and ordered between Receive and Daily Closing", () => {
  const withoutPermission = navigation
    .visibleEmployeeNavigation(["inventory.receive_new_stock"])
    .map((item) => item.key);
  assert.equal(withoutPermission.includes("stock-out-product-release"), false);

  const stockOutOnly = navigation.visibleEmployeeNavigation([
    "inventory.release_sales_stock",
  ]);
  assert.equal(
    stockOutOnly.find((item) => item.key === "stock-out-product-release")?.route,
    "/employee/inventory/stock-out",
  );
  assert.equal(
    stockOutOnly.some((item) => item.key === "receive-new-stock"),
    false,
  );

  const inventoryItems = navigation
    .visibleEmployeeNavigation([
      "inventory.receive_new_stock",
      "inventory.release_sales_stock",
      "inventory.daily_closing_view",
    ])
    .filter((item) => item.group === "Inventory and Logistics")
    .map((item) => item.key);
  assert.deepEqual(inventoryItems.slice(0, 3), [
    "receive-new-stock",
    "stock-out-product-release",
    "inventory-daily-closing",
  ]);
});

test("Employee Inventory dashboard route follows the first authorized inventory workflow", () => {
  assert.equal(
    navigation
      .employeeModuleRouteMap(["inventory.release_sales_stock"])
      .get("inventory"),
    "/employee/inventory/stock-out",
  );
  assert.equal(
    navigation
      .employeeModuleRouteMap([
        "inventory.receive_new_stock",
        "inventory.release_sales_stock",
      ])
      .get("inventory"),
    "/employee/inventory/receive",
  );
});
