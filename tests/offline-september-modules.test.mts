import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const builder = await readFile("scripts/build-native-schema.mjs", "utf8");
const schema = await readFile("database/native/schema.sql", "utf8");

const expectedLateMigrations = [
  "202609020001_cashbook_admin_audit_local.sql",
  "202609040001_warehouse_expense_vouchers.sql",
  "202609050001_cargo_tracking_phase1.sql",
  "202609050002_cargo_tracking_shared_carrier.sql",
  "202609050003_cargo_tracking_phase2_warehouse_operations.sql",
  "202609060001_cargo_tracking_phase2_validation_corrections.sql",
  "202609060002_rmb_payment_service_phase1.sql",
  "202609060003_rmb_payment_service_phase1_corrections.sql",
  "202609070001_cargo_tracking_phase3_permissions.sql",
  "202609080001_donation_expenses_phase1.sql",
  "202609080002_donation_recurring_support_reminder_control.sql",
  "202609090001_rmb_payment_service_phase2_customer_portal_rate.sql",
  "202609100001_cargo_customer_portal_billing.sql",
  "202609110001_employee_loan_application_agreement.sql",
  "202609110002_employee_profile_parent_names.sql",
  "202609130005_murshida_manzil_owner_phone.sql",
  "202609150001_murshida_manzil_tenant_phone.sql",
  "202609150002_murshida_manzil_advance_adjustment_defaults.sql",
  "202609160001_murshida_owner_expense_allocation.sql",
  "202609170001_rmb_customer_service_percentage.sql",
];

test("offline schema builder includes every September feature migration in order", () => {
  let previous = -1;
  for (const migration of expectedLateMigrations) {
    const position = builder.indexOf(`"${migration}"`);
    assert.ok(position > previous, `${migration} must be listed once and in order`);
    previous = position;
  }
});

test("offline schema contains the late feature tables and permissions", () => {
  for (const contract of [
    /warehouse_expense_vouchers/i,
    /cargo_shipping_jobs/i,
    /cargo_invoices/i,
    /rmb_payment_jobs/i,
    /donation_expenses/i,
    /receivable_employee_loan_details/i,
    /owner_allocation_mode/i,
    /service_percentage/i,
    /cashbook_scope/i,
  ]) {
    assert.match(schema, contract);
  }
});

test("offline source exposes every late feature route", async () => {
  const routes = await Promise.all([
    "app/admin/warehouse-expenses/page.tsx",
    "app/admin/cargo-tracking/page.tsx",
    "app/admin/cargo-tracking/[jobId]/edit-tracking/page.tsx",
    "app/account/cargo/page.tsx",
    "app/admin/rmb-payments/page.tsx",
    "app/account/rmb-payments/page.tsx",
    "app/admin/donation-expenses/page.tsx",
    "app/admin/receivables/loans/page.tsx",
  ].map((path) => readFile(path, "utf8")));
  assert.ok(routes.every((source) => source.length > 100));
});
