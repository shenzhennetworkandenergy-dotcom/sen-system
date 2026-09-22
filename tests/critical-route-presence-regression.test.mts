import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

const establishedRoutePages = new Map([
  ["/employee", "app/employee/page.tsx"],
  ["/employee/hr", "app/employee/hr/page.tsx"],
  ["/employee/hr/attendance", "app/employee/hr/attendance/page.tsx"],
  ["/employee/inventory/receive", "app/employee/inventory/receive/page.tsx"],
  ["/employee/inventory/stock-out", "app/employee/inventory/stock-out/page.tsx"],
  ["/admin/inventory/daily-closing", "app/admin/inventory/daily-closing/page.tsx"],
  ["/admin/purchasing", "app/admin/purchasing/page.tsx"],
  ["/admin/purchasing/[id]", "app/admin/purchasing/[id]/page.tsx"],
  ["/admin/sales", "app/admin/sales/page.tsx"],
  ["/admin/quotations", "app/admin/quotations/page.tsx"],
  ["/admin/accounting", "app/admin/accounting/page.tsx"],
]);

test("established Employee and Admin navigation targets all have App Router pages", async () => {
  const missing: string[] = [];

  for (const [route, page] of establishedRoutePages) {
    await access(page).catch(() => missing.push(`${route} -> ${page}`));
  }

  assert.deepEqual(missing, []);
});
