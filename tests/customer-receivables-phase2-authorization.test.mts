import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessSaleUnderScope,
  resolveSalesVisibilityScope,
} from "../lib/sales/visibility.ts";

const employeeId = "11111111-1111-4111-8111-111111111111";

test("active Admin and broad Sales viewers receive all-Sales scope", () => {
  assert.deepEqual(resolveSalesVisibilityScope({ role: "admin", status: "active", profileId: employeeId, permissions: new Set() }), { kind: "all" });
  assert.deepEqual(resolveSalesVisibilityScope({ role: "employee", status: "active", profileId: employeeId, permissions: new Set(["sales.view"]) }), { kind: "all" });
  assert.deepEqual(resolveSalesVisibilityScope({ role: "employee", status: "active", profileId: employeeId, permissions: new Set(["sales.view_all"]) }), { kind: "all" });
});

test("own-only scope exposes only Sales created by that employee", () => {
  const scope = resolveSalesVisibilityScope({ role: "employee", status: "active", profileId: employeeId, permissions: new Set(["sales.view_own"]) });
  assert.deepEqual(scope, { kind: "own", profileId: employeeId });
  assert.equal(canAccessSaleUnderScope(scope, employeeId), true);
  assert.equal(canAccessSaleUnderScope(scope, "22222222-2222-4222-8222-222222222222"), false);
});

test("inactive accounts and users without Sales view permission receive no scope", () => {
  assert.deepEqual(resolveSalesVisibilityScope({ role: "employee", status: "inactive", profileId: employeeId, permissions: new Set(["sales.view_all"]) }), { kind: "none" });
  assert.deepEqual(resolveSalesVisibilityScope({ role: "employee", status: "active", profileId: employeeId, permissions: new Set(["receivables.view", "receivables.view_customer"]) }), { kind: "none" });
  assert.equal(canAccessSaleUnderScope({ kind: "none" }, employeeId), false);
});
