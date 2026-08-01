import assert from "node:assert/strict";
import test from "node:test";

import {
  employeePermissionModuleKeys,
  resolveEmployeeDirectoryAccess,
  resolveEmployeeDetailAccess,
} from "../lib/auth/employee-permission-submodules.ts";
import { visibleEmployeeNavigation } from "../lib/navigation/dashboard.ts";

test("every Employees permission exposes the Employees navigation module", () => {
  for (const permission of employeePermissionModuleKeys) {
    const items = visibleEmployeeNavigation([permission]);
    assert.equal(items.some((item) => item.key === "employees"), true, permission);
  }
});

test("directory access reveals only the capabilities granted to the employee", () => {
  assert.deepEqual(resolveEmployeeDirectoryAccess(new Set(["employees.view_activity"])), {
    canOpen: true,
    canViewContactSummary: false,
    canViewDetails: false,
    canEditProfile: false,
    canViewPermissions: false,
    canManagePermissions: false,
    canViewActivity: true,
  });
});

test("detail access keeps each sensitive submodule independent", () => {
  assert.deepEqual(resolveEmployeeDetailAccess(new Set([
    "employees.view_detail",
    "employees.manage_permissions",
  ])), {
    canOpen: true,
    canViewDetails: true,
    canEditProfile: false,
    canViewPermissions: false,
    canManagePermissions: true,
    canViewActivity: false,
  });
});

test("an unrelated permission cannot open the Employees module", () => {
  assert.equal(resolveEmployeeDirectoryAccess(new Set(["products.view"])).canOpen, false);
  assert.equal(resolveEmployeeDetailAccess(new Set(["products.view"])).canOpen, false);
});
