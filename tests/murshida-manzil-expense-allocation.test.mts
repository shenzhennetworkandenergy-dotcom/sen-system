import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allocateByOwnership, calculateDistributableAmount } from "../lib/murshida-manzil/calculations.ts";
import { buildExpense, buildOwnerAllocationRows, buildRentAllocationRows } from "../lib/murshida-manzil/expense-allocation.ts";
import { persistRentAndAllocations } from "../lib/murshida-manzil/rent-allocation.ts";
import { buildOwnerRentAccountReport } from "../lib/murshida-manzil/reports.ts";

test("standalone advance receipts are excluded and applied advance is counted once", () => {
  assert.equal(calculateDistributableAmount({ actualRentPayments: 0, advanceAppliedToRent: 0, expenses: 0 }), 0);
  assert.equal(calculateDistributableAmount({ actualRentPayments: 0, advanceAppliedToRent: 8000, expenses: 0 }), 8000);
  assert.equal(calculateDistributableAmount({ actualRentPayments: 70000, advanceAppliedToRent: 8000, expenses: 0 }), 78000);
});

test("expense validation and distributable reduction use Murshida fields", () => {
  assert.deepEqual(buildExpense({ expenseDate: "2026-09-13", description: "Repair", amount: 1000 }), {
    expense_date: "2026-09-13", description: "Repair", amount: 1000,
  });
  assert.throws(() => buildExpense({ expenseDate: "", description: "Repair", amount: 1000 }));
  assert.equal(calculateDistributableAmount({ actualRentPayments: 10000, advanceAppliedToRent: 0, expenses: 2500 }), 7500);
});

test("allocation rows preserve the percentage snapshot and total", () => {
  const rows = buildOwnerAllocationRows("expense", "expense-1", 100, [
    { id: "a", percentage: 40 }, { id: "b", percentage: 20 }, { id: "c", percentage: 20 }, { id: "d", percentage: 20 },
  ]);
  assert.deepEqual(rows.map((row) => row.allocated_amount), [40, 20, 20, 20]);
  assert.deepEqual(rows.map((row) => row.ownership_percentage_snapshot), [40, 20, 20, 20]);
  assert.equal(rows.reduce((sum, row) => sum + row.allocated_amount, 0), 100);
});

test("allocation rejects a non-100 percent active owner set", () => {
  assert.throws(() => allocateByOwnership(100, [{ id: "a", percentage: 60 }, { id: "b", percentage: 30 }]));
});

test("allocation source types remain limited to Murshida income and expense", () => {
  const source = buildOwnerAllocationRows("rent_income", "rent-1", 80, [{ id: "a", percentage: 100 }])[0];
  assert.equal(source.source_type, "rent_income");
  assert.equal(source.source_id, "rent-1");
});

test("rent allocation plan snapshots active ownership and reconciles eligible rent", () => {
  const rows = buildRentAllocationRows("rent-70000", 70000, [
    { id: "a", ownership_percentage: 40 },
    { id: "b", ownership_percentage: 30 },
    { id: "c", ownership_percentage: 30 },
  ]);
  assert.deepEqual(rows.map((row) => row.allocated_amount), [28000, 21000, 21000]);
  assert.deepEqual(rows.map((row) => row.ownership_percentage_snapshot), [40, 30, 30]);
  assert.equal(rows.reduce((sum, row) => sum + Number(row.allocated_amount), 0), 70000);
});

test("rent persistence path inserts rent then allocation rows and rolls back on allocation failure", async () => {
  const events: string[] = [];
  const id = await persistRentAndAllocations({ total_rent_settled: 70000 }, [
    { id: "a", ownership_percentage: 40 }, { id: "b", ownership_percentage: 30 }, { id: "c", ownership_percentage: 30 },
  ], {
    insertRentTransaction: async () => { events.push("rent"); return "rent-1"; },
    hasOwnerAllocationsForSource: async () => false,
    insertOwnerAllocations: async (rows) => { events.push(`alloc:${rows.reduce((sum, row) => sum + Number(row.allocated_amount), 0)}`); },
    deleteRentTransaction: async () => { events.push("rollback"); },
  });
  assert.equal(id, "rent-1");
  assert.deepEqual(events, ["rent", "alloc:70000"]);
});

test("allocation persistence uses one atomic bulk insert", () => {
  const repository = readFileSync(new URL("../lib/murshida-manzil/repository.ts", import.meta.url), "utf8");
  assert.match(repository, /from\("owner_allocations"\)\.insert\(rows\)/);
});

test("owner expense allocation modes are explicit and legacy-safe", () => {
  const action = readFileSync("app/admin/murshida-manzil/actions.ts", "utf8");
  const page = readFileSync("app/admin/murshida-manzil/page.tsx", "utf8");
  const migration = readFileSync("supabase/migrations/202609160001_murshida_owner_expense_allocation.sql", "utf8");
  assert.match(action, /owner_allocation_mode/);
  assert.match(page, /Distribute to Owners/);
  assert.match(page, /Do Not Distribute/);
  assert.match(migration, /DO_NOT_DISTRIBUTE/);
  assert.match(migration, /record_expense_with_allocations/);
});

test("owner rent account derives gross expense and net balances from snapshots", () => {
  const result = buildOwnerRentAccountReport({
    owner: { id: "a", name: "Owner A", is_active: true, ownership_percentage: 30 },
    allocations: [
      { source_type: "rent_income", source_id: "r1", ownership_percentage_snapshot: 40, allocated_amount: 56000 },
      { source_type: "expense", source_id: "e1", ownership_percentage_snapshot: 40, allocated_amount: 12000 },
    ],
    rents: [{ id: "r1", payment_date: "2026-09-15", total_rent_settled: 140000, tenant_name: "Tenant" }],
    expenses: [{ id: "e1", expense_date: "2026-09-15", description: "Repair", amount: 30000, category: "Property" }],
  });
  assert.equal(result.selectedPeriodGrossRentShare, 56000);
  assert.equal(result.selectedPeriodExpenseShare, 12000);
  assert.equal(result.selectedPeriodNetBalance, 44000);
  assert.equal(result.monthly[0].netBalance, 44000);
  assert.equal(result.expenseDetails[0].ownerExpenseShare, 12000);
});

test("net owner balance may be negative and legacy expenses are not backfilled", () => {
  const result = buildOwnerRentAccountReport({
    owner: { id: "a", name: "Owner A", is_active: true, ownership_percentage: 40 },
    allocations: [{ source_type: "expense", source_id: "e1", ownership_percentage_snapshot: 40, allocated_amount: 15000 }],
    rents: [],
    expenses: [{ id: "e1", expense_date: "2026-09-16", description: "Repair", amount: 37500 }],
  });
  assert.equal(result.fromBeginningNetBalance, -15000);
  const migration = readFileSync("supabase/migrations/202609160001_murshida_owner_expense_allocation.sql", "utf8");
  assert.match(migration, /default 'DO_NOT_DISTRIBUTE'/);
  assert.match(readFileSync("supabase/migrations/202609130001_murshida_manzil.sql", "utf8"), /unique \(owner_id, source_type, source_id\)/);
});
