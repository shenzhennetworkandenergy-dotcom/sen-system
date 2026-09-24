import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmployeeWorkplaceSummary,
  employeeAssignmentRevalidationPaths,
} from "../lib/hr/profile-workplace-domain.ts";

test("employee profile summary exposes the assigned workplace and warehouse", () => {
  const summary = buildEmployeeWorkplaceSummary(
    {
      work_locations: {
        name: "Dhaka Office",
        code: "DHK-01",
        city: "Dhaka",
        country_code: "BD",
      },
    },
    {
      warehouses: {
        name: "Bangladesh Warehouse",
        code: "BD-WH",
        address: "West Dhanmondi",
        country_name: "Bangladesh",
      },
    },
  );

  assert.deepEqual(summary, {
    workplace: {
      name: "Dhaka Office",
      code: "DHK-01",
      location: "Dhaka, BD",
    },
    warehouse: {
      name: "Bangladesh Warehouse",
      code: "BD-WH",
      location: "West Dhanmondi · Bangladesh",
    },
  });
});

test("employee profile summary keeps missing assignments explicit", () => {
  assert.deepEqual(buildEmployeeWorkplaceSummary(null, null), {
    workplace: null,
    warehouse: null,
  });
});

test("assignment changes refresh admin and employee profile routes", () => {
  assert.deepEqual(employeeAssignmentRevalidationPaths("employee-123"), [
    "/admin/users/employee-123",
    "/employee/profile",
    "/profile",
  ]);
});
