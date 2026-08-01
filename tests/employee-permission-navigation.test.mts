import assert from "node:assert/strict";
import test from "node:test";

import {
  visibleAdminNavigation,
  visibleEmployeeNavigation,
} from "../lib/navigation/dashboard.ts";

test("employees.view exposes only the employee directory business module", () => {
  const items = visibleEmployeeNavigation(["employees.view"]);
  const businessItems = items.filter((item) => item.requiredPermission);

  assert.deepEqual(
    businessItems.map((item) => [item.label, item.route]),
    [["Employees", "/employee/employees"]],
  );
});

test("unchecked employee modules are absent from navigation", () => {
  const keys = visibleEmployeeNavigation(["employees.view"]).map((item) => item.key);

  assert.equal(keys.includes("products"), false);
  assert.equal(keys.includes("orders"), false);
  assert.equal(keys.includes("accounting"), false);
});

test("all sales landing-page permissions expose the Sales module", () => {
  for (const permission of ["sales.view", "sales.view_all", "sales.view_own"]) {
    const keys = visibleEmployeeNavigation([permission]).map((item) => item.key);
    assert.equal(keys.includes("sales"), true, `${permission} should expose Sales`);
  }
});

test("admin navigation applies adminVisible and never shows employee-only shortcuts", () => {
  const keys = visibleAdminNavigation().map((item) => item.key);

  assert.equal(keys.includes("overview"), true);
  assert.equal(keys.includes("create-quotation"), false);
  assert.equal(keys.includes("employee-dashboard"), false);
});
