import { readFile, writeFile } from "node:fs/promises";

const rawUrl = new URL("../database/native/schema-public.raw.sql", import.meta.url);
const purchaseCarrierMigrationUrl = new URL(
  "../supabase/migrations/202608190001_purchase_carrier_management.sql",
  import.meta.url,
);
const dailyClosingMigrationUrl = new URL(
  "../supabase/migrations/202608210002_inventory_daily_closing.sql",
  import.meta.url,
);
const stockOutMigrationUrl = new URL(
  "../supabase/migrations/202608220001_employee_stock_out_product_release.sql",
  import.meta.url,
);
const salesPaymentAccountingMigrationUrl = new URL(
  "../supabase/migrations/202608230001_sales_payment_accounting_integration.sql",
  import.meta.url,
);
const supplierShipmentTrackingCorrectionMigrationUrl = new URL(
  "../supabase/migrations/202608230002_supplier_shipment_tracking_correction.sql",
  import.meta.url,
);
const quotationViewOwnMigrationUrl = new URL(
  "../supabase/migrations/202608230003_quotation_view_own.sql",
  import.meta.url,
);
const quotationToSaleMigrationUrl = new URL(
  "../supabase/migrations/202608230004_quotation_to_sale.sql",
  import.meta.url,
);
const stockOutReleaseQuantityMigrationUrl = new URL(
  "../supabase/migrations/202608240001_stock_out_authoritative_release_quantity.sql",
  import.meta.url,
);
const receivablesMigrationUrl = new URL(
  "../supabase/migrations/202608250001_receivables_phase1.sql",
  import.meta.url,
);
const customerReceivablesMigrationUrl = new URL(
  "../supabase/migrations/202608250002_customer_receivables_phase2.sql",
  import.meta.url,
);
const draftQuotationEditingMigrationUrl = new URL(
  "../supabase/migrations/202608250003_draft_quotation_editing.sql",
  import.meta.url,
);
const nonSalesReceivablesMigrationUrl = new URL(
  "../supabase/migrations/202608250004_non_sales_receivables_phase3.sql",
  import.meta.url,
);
const payrollReceivablesMigrationUrl = new URL(
  "../supabase/migrations/202608250005_payroll_receivables_phase4.sql",
  import.meta.url,
);
const receivablesAccountingMigrationUrl = new URL(
  "../supabase/migrations/202608250006_receivables_accounting_phase5.sql",
  import.meta.url,
);
const salesMoneyReceiptMigrationUrl = new URL(
  "../supabase/migrations/202608310001_sales_money_receipts.sql",
  import.meta.url,
);
const cashbookAuditMigrationUrl = new URL(
  "../supabase/migrations/202609010001_accounting_cashbook_audit.sql",
  import.meta.url,
);
const preMurshidaFeatureMigrationFiles = [
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
];
const murshidaManzilMigrationUrl = new URL(
  "../supabase/migrations/202609130001_murshida_manzil.sql",
  import.meta.url,
);
const murshidaManzilUnitsMigrationUrl = new URL(
  "../supabase/migrations/202609130002_murshida_manzil_units.sql",
  import.meta.url,
);
const murshidaManzilRentAdvanceMigrationUrl = new URL(
  "../supabase/migrations/202609130003_murshida_manzil_rent_advance_foundation.sql",
  import.meta.url,
);
const murshidaManzilSnapshotsMigrationUrl = new URL(
  "../supabase/migrations/202609130004_murshida_manzil_unit_description_snapshots.sql",
  import.meta.url,
);
const postMurshidaFeatureMigrationFiles = [
  "202609130005_murshida_manzil_owner_phone.sql",
  "202609150001_murshida_manzil_tenant_phone.sql",
  "202609150002_murshida_manzil_advance_adjustment_defaults.sql",
  "202609160001_murshida_owner_expense_allocation.sql",
  "202609170001_rmb_customer_service_percentage.sql",
];
const personalQuickCashbookMigrationUrl = new URL(
  "../supabase/migrations/202609200001_personal_quick_cashbook.sql",
  import.meta.url,
);
const outputUrl = new URL("../database/native/schema.sql", import.meta.url);
const [
  raw,
  purchaseCarrierMigration,
  dailyClosingMigration,
  stockOutMigration,
  salesPaymentAccountingMigration,
  supplierShipmentTrackingCorrectionMigration,
  quotationViewOwnMigration,
  quotationToSaleMigration,
  stockOutReleaseQuantityMigration,
  receivablesMigration,
  customerReceivablesMigration,
  draftQuotationEditingMigration,
  nonSalesReceivablesMigration,
  payrollReceivablesMigration,
  receivablesAccountingMigration,
  salesMoneyReceiptMigration,
  cashbookAuditMigration,
  murshidaManzilMigration,
  murshidaManzilUnitsMigration,
  murshidaManzilRentAdvanceMigration,
  murshidaManzilSnapshotsMigration,
  personalQuickCashbookMigration,
] = await Promise.all([
  readFile(rawUrl, "utf8"),
  readFile(purchaseCarrierMigrationUrl, "utf8"),
  readFile(dailyClosingMigrationUrl, "utf8"),
  readFile(stockOutMigrationUrl, "utf8"),
  readFile(salesPaymentAccountingMigrationUrl, "utf8"),
  readFile(supplierShipmentTrackingCorrectionMigrationUrl, "utf8"),
  readFile(quotationViewOwnMigrationUrl, "utf8"),
  readFile(quotationToSaleMigrationUrl, "utf8"),
  readFile(stockOutReleaseQuantityMigrationUrl, "utf8"),
  readFile(receivablesMigrationUrl, "utf8"),
  readFile(customerReceivablesMigrationUrl, "utf8"),
  readFile(draftQuotationEditingMigrationUrl, "utf8"),
  readFile(nonSalesReceivablesMigrationUrl, "utf8"),
  readFile(payrollReceivablesMigrationUrl, "utf8"),
  readFile(receivablesAccountingMigrationUrl, "utf8"),
  readFile(salesMoneyReceiptMigrationUrl, "utf8"),
  readFile(cashbookAuditMigrationUrl, "utf8"),
  readFile(murshidaManzilMigrationUrl, "utf8"),
  readFile(murshidaManzilUnitsMigrationUrl, "utf8"),
  readFile(murshidaManzilRentAdvanceMigrationUrl, "utf8"),
  readFile(murshidaManzilSnapshotsMigrationUrl, "utf8"),
  readFile(personalQuickCashbookMigrationUrl, "utf8"),
]);

const withoutAuthForeignKey = raw.replace(
  /\n--\n-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT;[\s\S]*?ALTER TABLE ONLY public\.profiles\s+ADD CONSTRAINT profiles_id_fkey FOREIGN KEY \(id\) REFERENCES auth\.users\(id\) ON DELETE CASCADE;\s*/,
  "\n",
);

let nativeSchema = withoutAuthForeignKey
  .replace(/CREATE SCHEMA public;/i, "CREATE SCHEMA IF NOT EXISTS public;")
  .replace(
    /CREATE SCHEMA storage;/i,
    `CREATE SCHEMA storage;

-- Supabase Storage is replaced by the native filesystem adapter. This
-- metadata-only catalogue lets feature migrations register their buckets.
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);`,
  );

if (!/create table if not exists storage\.buckets/i.test(nativeSchema)) {
  nativeSchema += `

-- Supabase Storage is replaced by the native filesystem adapter. This
-- metadata-only catalogue lets feature migrations register their buckets.
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);`;
}

if (withoutAuthForeignKey === raw || /REFERENCES auth\.users/i.test(withoutAuthForeignKey)) {
  throw new Error("Unable to remove the Supabase Auth profile foreign key from the native schema.");
}

const bootstrap = `-- Generated native PostgreSQL 17 baseline for SEN Windows/LAN operation.\n-- Source: verified public schema; Supabase Auth ownership is replaced by local credentials.\n\ncreate extension if not exists pgcrypto;\n\ndo $$ begin\n  create role anon nologin;\nexception when duplicate_object then null; end $$;\ndo $$ begin\n  create role authenticated nologin;\nexception when duplicate_object then null; end $$;\ndo $$ begin\n  create role service_role nologin bypassrls;\nexception when duplicate_object then null; end $$;\ndo $$ begin\n  create role sen_app nologin bypassrls;\nexception when duplicate_object then null; end $$;\ngrant service_role to sen_app;\n\ncreate schema if not exists auth;\ncreate or replace function auth.uid() returns uuid language sql stable as $$\n  select coalesce(nullif(current_setting('sen.actor_id', true), '')::uuid, nullif(current_setting('request.jwt.claim.sub', true), '')::uuid)\n$$;\ncreate or replace function auth.role() returns text language sql stable as $$\n  select coalesce(nullif(current_setting('sen.actor_role', true), ''), nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', current_user)\n$$;\n\n`;

const bootstrapWithExtensions = bootstrap.replace(
  "create extension if not exists pgcrypto;",
  "create schema if not exists extensions;\ncreate extension if not exists pgcrypto with schema extensions;",
);

const grants = `\n-- Native application service access. Browser users never receive this role.\ngrant usage on schema public to service_role;\ngrant all privileges on all tables in schema public to service_role;\ngrant all privileges on all sequences in schema public to service_role;\ngrant execute on all functions in schema public to service_role;\nalter default privileges in schema public grant all on tables to service_role;\nalter default privileges in schema public grant all on sequences to service_role;\nalter default privileges in schema public grant execute on functions to service_role;\n`;

const readMigrationSeries = (files) => Promise.all(
  files.map((file) => readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8")),
);
const [preMurshidaFeatureMigrations, postMurshidaFeatureMigrations] = await Promise.all([
  readMigrationSeries(preMurshidaFeatureMigrationFiles),
  readMigrationSeries(postMurshidaFeatureMigrationFiles),
]);
const joinMigrations = (migrations) => migrations
  .map((migration) => migration.trim())
  .join("\n\n");

await writeFile(
  outputUrl,
  `${bootstrapWithExtensions}${nativeSchema.trim()}\n\n${purchaseCarrierMigration.trim()}\n\n${dailyClosingMigration.trim()}\n\n${stockOutMigration.trim()}\n\n${salesPaymentAccountingMigration.trim()}\n\n${supplierShipmentTrackingCorrectionMigration.trim()}\n\n${quotationViewOwnMigration.trim()}\n\n${quotationToSaleMigration.trim()}\n\n${stockOutReleaseQuantityMigration.trim()}\n\n${receivablesMigration.trim()}\n\n${customerReceivablesMigration.trim()}\n\n${draftQuotationEditingMigration.trim()}\n\n${nonSalesReceivablesMigration.trim()}\n\n${payrollReceivablesMigration.trim()}\n\n${receivablesAccountingMigration.trim()}\n\n${salesMoneyReceiptMigration.trim()}\n\n${cashbookAuditMigration.trim()}\n\n${joinMigrations(preMurshidaFeatureMigrations)}\n\n${murshidaManzilMigration.trim()}\n\n${murshidaManzilUnitsMigration.trim()}\n\n${murshidaManzilRentAdvanceMigration.trim()}\n\n${murshidaManzilSnapshotsMigration.trim()}\n\n${joinMigrations(postMurshidaFeatureMigrations)}\n\n${personalQuickCashbookMigration.trim()}\n${grants}`,
  "utf8",
);
console.log("Native PostgreSQL schema generated without the Supabase Auth foreign key.");
