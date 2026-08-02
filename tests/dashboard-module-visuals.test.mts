import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import * as dashboard from "../lib/navigation/dashboard.ts";

test("dashboard module tones map groups, aliases, and account indexes to stable palette values", () => {
  assert.equal(typeof dashboard.dashboardToneForGroup, "function");
  assert.equal(typeof dashboard.dashboardToneForModule, "function");
  assert.equal(typeof dashboard.dashboardToneForIndex, "function");

  const groupTones = [
    dashboard.dashboardToneForGroup("Administration"),
    dashboard.dashboardToneForGroup("Commerce and Customers"),
    dashboard.dashboardToneForGroup("Inventory and Logistics"),
    dashboard.dashboardToneForGroup("Procurement and Finance"),
    dashboard.dashboardToneForGroup("Organization"),
    dashboard.dashboardToneForGroup("Insights and System"),
  ];
  assert.equal(new Set(groupTones).size >= 5, true);
  assert.equal(dashboard.dashboardToneForModule({ key: "receive-new-stock", moduleKey: "inventory" }), "emerald");
  assert.equal(dashboard.dashboardToneForModule({ key: "work-locations", moduleKey: "warehouses" }), "violet");
  assert.equal(dashboard.dashboardToneForModule({ key: "tracking-statuses", moduleKey: "serials" }), "amber");
  assert.equal(dashboard.dashboardToneForModule({ key: "unknown" }), "blue");
  assert.equal(dashboard.dashboardToneForIndex(0), dashboard.dashboardToneForIndex(6));
  assert.notEqual(dashboard.dashboardToneForIndex(0), dashboard.dashboardToneForIndex(1));
});

test("dashboard surfaces expose semantic tone hooks and finite accessible motion", async () => {
  const [navigation, shell, admin, employee, account, css] = await Promise.all([
    readFile("components/dashboard/DashboardNavigation.tsx", "utf8"),
    readFile("components/dashboard/Shell.tsx", "utf8"),
    readFile("app/admin/page.tsx", "utf8"),
    readFile("app/employee/page.tsx", "utf8"),
    readFile("app/account/page.tsx", "utf8"),
    readFile("app/globals.css", "utf8"),
  ]);

  assert.match(shell, /data-dashboard-role=\{profile\?\.role/);
  assert.match(navigation, /data-dashboard-tone=\{dashboardToneForGroup\(group\)\}/);
  assert.match(navigation, /data-dashboard-tone=\{dashboardToneForModule\(item\)\}/);
  assert.match(navigation, /sen-dashboard-module-mark/);
  assert.match(admin, /data-dashboard-module-card/);
  assert.match(employee, /data-dashboard-module-card/);
  assert.match(employee, /data-dashboard-availability=/);
  assert.doesNotMatch(employee, /rounded border p-4 opacity-70/);
  assert.match(account, /dashboardToneForIndex\(index\)/);
  assert.match(account, /data-dashboard-module-card/);
  assert.match(css, /--dashboard-module-accent/);
  assert.match(css, /data-dashboard-tone="emerald"/);
  assert.match(css, /data-dashboard-role="admin"/);
  assert.match(css, /animation:\s*sen-dashboard-module-accent\s+.*\b1\b/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*sen-dashboard-module-card/);
});
