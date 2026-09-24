import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import test from "node:test";

import { buildAdvancePayment, buildRentTransaction, calculateAdvanceAdjustment, validateAdvanceAdjustment, validateTenantInput } from "../lib/murshida-manzil/tenant-rent.ts";

const tenant = { name: "Tenant", unitId: "unit-1", unitCode: "A-1", monthlyRent: 80000, unitDescription: "First floor A-1" };

test("tenant input preserves unit description and validates active unit assignment", () => {
  assert.deepEqual(validateTenantInput({ ...tenant, isActive: true }), { ...tenant, isActive: true });
  assert.throws(() => validateTenantInput({ ...tenant, unitId: null, unitCode: "" }), /unit/i);
});

test("rent transaction stores stable unit identity and snapshot", () => {
  assert.deepEqual(buildRentTransaction({ tenantId: "tenant-1", ...tenant, rentYear: 2026, rentMonth: 9, paymentDate: "2026-09-13", actualMoneyReceived: 80000, advanceAdjusted: 0, advanceBalanceBefore: 0, paymentMethod: "cash", moneyReceiptNumber: "MM-MR-1", rentReceiptNumber: "MM-RR-1" }), {
    tenant_id: "tenant-1", unit_id: "unit-1", unit_code_snapshot: "A-1", unit_description_snapshot: "First floor A-1", rent_year: 2026, rent_month: 9, monthly_rent: 80000, actual_money_received: 80000, advance_adjusted: 0, total_rent_settled: 80000, advance_balance_before: 0, advance_balance_after: 0, payment_date: "2026-09-13", payment_method: "cash", money_receipt_number: "MM-MR-1", rent_receipt_number: "MM-RR-1",
  });
});

test("rent and advance schemas preserve transaction-time unit descriptions", () => {
  const migration = "supabase/migrations/202609130004_murshida_manzil_unit_description_snapshots.sql";
  assert.equal(existsSync(migration), true);
  const sql = readFileSync(migration, "utf8");
  assert.match(sql, /rent_transactions.*unit_description_snapshot|rent_transactions[\s\S]*add column unit_description_snapshot text/i);
  assert.match(sql, /advance_payments[\s\S]*add column unit_description_snapshot text/i);
  assert.doesNotMatch(sql, /drop\s+(table|column)/i);
});

test("standalone advance payment stores tenant, unit, amount, date, and snapshot", () => {
  assert.deepEqual(buildAdvancePayment({ tenantId: "tenant-1", unitId: "unit-1", unitCode: "A-1", unitDescription: "First floor A-1", amount: 15000, defaultMonthlyAdjustment: 3000, paymentDate: "2026-09-13" }), {
    tenant_id: "tenant-1", unit_id: "unit-1", unit_code_snapshot: "A-1", unit_description_snapshot: "First floor A-1", amount: 15000, default_monthly_advance_adjustment: 3000, payment_date: "2026-09-13",
  });
});

test("advance defaults are capped by balance and monthly rent", () => {
  assert.equal(calculateAdvanceAdjustment({ configuredMonthlyDeduction: 10000, availableAdvanceBalance: 100000, monthlyRent: 70000 }), 10000);
  assert.equal(calculateAdvanceAdjustment({ configuredMonthlyDeduction: 10000, availableAdvanceBalance: 6000, monthlyRent: 70000 }), 6000);
  assert.equal(calculateAdvanceAdjustment({ configuredMonthlyDeduction: 10000, availableAdvanceBalance: 0, monthlyRent: 70000 }), 0);
});

test("advance adjustments reject negative, over-balance, and over-rent values", () => {
  assert.equal(validateAdvanceAdjustment(15000, 100000, 70000), 15000);
  assert.throws(() => validateAdvanceAdjustment(-1, 100000, 70000), /negative/i);
  assert.throws(() => validateAdvanceAdjustment(100001, 100000, 70000), /balance/i);
  assert.throws(() => validateAdvanceAdjustment(70001, 100000, 70000), /rent/i);
});

test("advance adjustment defaults are additive Murshida-only schema fields", () => {
  const sql = readFileSync("supabase/migrations/202609150002_murshida_manzil_advance_adjustment_defaults.sql", "utf8");
  assert.match(sql, /murshida_manzil\.tenants[\s\S]*default_monthly_advance_adjustment/i);
  assert.match(sql, /murshida_manzil\.advance_payments[\s\S]*default_monthly_advance_adjustment/i);
  assert.doesNotMatch(sql, /drop\s+(table|column)|public\./i);
});

test("actions remain Admin-only and do not repurpose advance adjustments or SEN modules", () => {
  const actions = readFileSync("app/admin/murshida-manzil/actions.ts", "utf8");
  assert.match(actions, /createTenantAction|createRentTransactionAction|createAdvancePaymentAction/);
  assert.match(actions, /requireProfile\(\["admin"\]\)/);
  assert.match(actions, /getTenantUnit/);
  assert.doesNotMatch(actions, /rent_advance_adjustments|journal_entries|cashbook_entries|sales_orders|inventory_movements/);
});
