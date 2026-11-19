import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildAllOwnersRentAccountReport, buildMurshidaSummary, filterByDateRange, mapAdvanceReport, mapAllocationReport, mapRentReport } from "../lib/murshida-manzil/reports.ts";

test("date filtering is inclusive and supports open boundaries", () => {
  const rows = [{ payment_date: "2026-09-01" }, { payment_date: "2026-09-15" }, { payment_date: "2026-09-30" }];
  assert.equal(filterByDateRange(rows, "2026-09-10", "2026-09-20").length, 1);
  assert.equal(filterByDateRange(rows, "", "2026-09-15").length, 2);
});

test("rent and advance reports use transaction snapshots", () => {
  const rent = mapRentReport({ id: "r1", payment_date: "2026-09-13", tenant_name: "Tenant", unit_code_snapshot: "A-1", unit_description_snapshot: "Old", rent_month: 9, rent_year: 2026, total_rent_settled: 80000, advance_adjusted: 10000 });
  const advance = mapAdvanceReport({ id: "a1", payment_date: "2026-09-13", tenant_name: "Tenant", unit_code_snapshot: "A-1", unit_description_snapshot: "Old", amount: 20000 });
  assert.equal(rent.unitSnapshot, "A-1 · Old");
  assert.equal(advance.unitSnapshot, "A-1 · Old");
});

test("summary totals exclude standalone advances from distributable income", () => {
  const summary = buildMurshidaSummary({ activeUnits: 2, activeTenants: 1, rents: [{ payment_date: "2026-09-01", total_rent_settled: 80000, actual_money_received: 70000, advance_adjusted: 10000 }], advances: [{ payment_date: "2026-09-01", amount: 20000 }], expenses: [{ expense_date: "2026-09-01", amount: 5000 }], allocations: [{ allocated_amount: 75000 }] });
  assert.deepEqual(summary, { activeUnits: 2, activeTenants: 1, rentReceived: 80000, standaloneAdvanceReceived: 20000, expenses: 5000, distributableAmount: 75000, allocatedAmount: 75000 });
});

test("allocation report preserves persisted percentage snapshots", () => {
  const row = mapAllocationReport({ id: "x", created_at: "2026-09-13T12:00:00Z", owner_name: "Current Name", source_type: "expense", source_id: "e1", ownership_percentage_snapshot: 40, allocated_amount: 100 });
  assert.equal(row.date, "2026-09-13");
  assert.equal(row.ownershipPercentage, 40);
  assert.equal(row.amount, 100);
});

test("all owners use their own rent and expense shares for both balances", () => {
  const rent = (id: string, payment_date: string) => ({ id, payment_date, total_rent_settled: 200 });
  const rents = [rent("prior", "2025-12-10"), rent("today", "2026-11-17"), rent("future", "2026-11-18")];
  const expenses = [{ id: "expense", expense_date: "2026-11-17", amount: 100 }];
  const share = (source_id: string, allocated_amount: number, source_type = "rent_income") => ({
    source_id, allocated_amount, source_type, ownership_percentage_snapshot: 25,
  });
  const account = (id: string, allocations: ReturnType<typeof share>[], is_active = true) => ({
    owner: { id, name: id, is_active, ownership_percentage: 25 }, rents, expenses, allocations,
  });
  const report = buildAllOwnersRentAccountReport([
    account("first", [share("prior", 40.01), share("today", 50.15), share("future", 25), share("expense", 10.20, "expense")]),
    account("second", [share("today", 49.85), share("expense", 9.80, "expense")]),
    account("archived", [share("expense", 2.11, "expense")], false),
    account("new", []),
  ], "2026-11-17", { from: "2026-11-17", to: "2026-11-17" });
  assert.deepEqual(report.rows.map(({ owner, periodBalance, outstandingBalance }) =>
    [owner.id, periodBalance, outstandingBalance]), [
    ["first", 39.95, 79.96],
    ["second", 40.05, 40.05],
    ["archived", -2.11, -2.11],
    ["new", 0, 0],
  ]);
  assert.equal(report.periodTotal, 77.89);
  assert.equal(report.outstandingTotal, 117.90);
  const outstandingOnly = buildAllOwnersRentAccountReport([
    account("first", [share("prior", 40.01), share("future", 25)]),
  ], "2026-11-17");
  assert.equal(outstandingOnly.outstandingTotal, 40.01);
});

test("reporting page is admin-only, read-only, and isolated", () => {
  const page = readFileSync(new URL("../app/admin/murshida-manzil/page.tsx", import.meta.url), "utf8");
  assert.match(page, /requireMurshida(?:Access|Manager)\(\)/);
  assert.match(page, /method="get"/);
  assert.match(page, /listRentReportRows/);
  assert.doesNotMatch(page, /@\/lib\/(accounting|sales|cashbook|inventory)/);
});
