import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildMonthlyOwnerIncomeReport } from "../lib/murshida-manzil/reports.ts";
import { buildOwnerRentAccountReport } from "../lib/murshida-manzil/reports.ts";

const owner = (id: string, name: string, percentage: number, amount: number, created_at: string) => ({ owner_id: id, owner_name: name, ownership_percentage_snapshot: percentage, allocated_amount: amount, created_at, source_type: "rent_income" });

test("monthly owner income totals reconcile across payments and months", () => {
  const result = buildMonthlyOwnerIncomeReport({
    rents: [{ payment_date: "2026-01-10", total_rent_settled: 80000 }, { payment_date: "2026-01-20", total_rent_settled: 20000 }, { payment_date: "2026-02-05", total_rent_settled: 50000 }],
    expenses: [{ expense_date: "2026-01-15", amount: 10000 }],
    allocations: [owner("a", "Owner A", 60, 54000, "2026-01-20T00:00:00Z"), owner("b", "Owner B", 40, 36000, "2026-01-20T00:00:00Z"), owner("a", "Owner A", 60, 30000, "2026-02-05T00:00:00Z"), owner("b", "Owner B", 40, 20000, "2026-02-05T00:00:00Z")],
  });
  assert.equal(result.monthly.length, 2);
  assert.equal(result.monthly[0].rentIncome, 100000);
  assert.equal(result.monthly[0].distributableIncome, 90000);
  assert.equal(result.monthly[0].payments, 2);
  assert.equal(result.ownerTotals.find((row) => row.ownerId === "a")?.amount, 84000);
  assert.equal(result.ownerTotals.find((row) => row.ownerId === "b")?.amount, 56000);
  assert.equal(result.totalAllocated, 140000);
  assert.equal(result.paymentCount, 3);
});

test("historical allocation snapshots remain authoritative and standalone advances are absent", () => {
  const result = buildMonthlyOwnerIncomeReport({ rents: [{ payment_date: "2026-03-01", total_rent_settled: 80000 }], expenses: [], allocations: [owner("a", "Owner A", 70, 56000, "2026-03-01T00:00:00Z"), owner("b", "Owner B", 30, 24000, "2026-03-01T00:00:00Z")] });
  assert.deepEqual(result.monthly[0].owners.map((row) => [row.name, row.percentage, row.amount]), [["Owner A", 70, 56000], ["Owner B", 30, 24000]]);
  assert.equal(result.totalRentIncome, 80000);
  assert.equal(result.totalAllocated, 80000);
});

test("monthly owner income report is read-only and uses a dedicated route", () => {
  const page = readFileSync("app/admin/murshida-manzil/reports/monthly-owner-income/page.tsx", "utf8");
  assert.match(page, /owner-income\/page/);
  const implementation = readFileSync("app/admin/murshida-manzil/reports/owner-income/page.tsx", "utf8");
  assert.match(implementation, /requireProfile\(\["admin"\]\)/);
  assert.match(implementation, /buildMonthlyOwnerIncomeReport/);
  assert.match(implementation, /PrintButton/);
  assert.doesNotMatch(implementation, /insert|update|delete/i);
});

test("owner rent account groups persisted rent allocations by payment month and snapshot", () => {
  const result = buildOwnerRentAccountReport({
    owner: { id: "a", name: "Owner A", phone_number: "01700000000", is_active: false, ownership_percentage: 25 },
    allocations: [
      { owner_id: "a", source_id: "rent-1", ownership_percentage_snapshot: 30, allocated_amount: 24000 },
      { owner_id: "a", source_id: "rent-2", ownership_percentage_snapshot: 25, allocated_amount: 12500 },
    ],
    rents: [
      { id: "rent-1", payment_date: "2026-01-10", tenant_name: "Tenant One", unit_code_snapshot: "A1", unit_description_snapshot: "First floor", rent_month: 1, rent_year: 2026, total_rent_settled: 80000 },
      { id: "rent-2", payment_date: "2026-02-10", tenant_name: "Tenant One", unit_code_snapshot: "A1", unit_description_snapshot: "First floor", rent_month: 2, rent_year: 2026, total_rent_settled: 50000 },
    ],
  });
  assert.equal(result.monthly.length, 2);
  assert.equal(result.monthly[0].eligibleRentIncome, 80000);
  assert.equal(result.monthly[0].ownerShare, 24000);
  assert.equal(result.monthly[0].ownerPercentage, 30);
  assert.equal(result.monthly[1].ownerShare, 12500);
  assert.equal(result.selectedPeriodTotal, 36500);
  assert.equal(result.fromBeginningTotal, 36500);
  assert.equal(result.monthly[0].transactions[0].tenantName, "Tenant One");
});

test("owner rent account route is admin-only, printable, and exposed by a dedicated button", () => {
  const page = readFileSync("app/admin/murshida-manzil/reports/owner-rent-account/page.tsx", "utf8");
  const button = readFileSync("app/admin/murshida-manzil/_components/LifecyclePanelWithReport.tsx", "utf8");
  assert.match(page, /requireProfile\(\["admin"\]\)/);
  assert.match(page, /OWNER RENT ACCOUNT STATEMENT/);
  assert.match(page, /PrintButton/);
  assert.doesNotMatch(page, /insert|update|delete/i);
  assert.match(button, /Owner Rent Account/);
});
