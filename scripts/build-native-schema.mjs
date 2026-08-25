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
const outputUrl = new URL("../database/native/schema.sql", import.meta.url);
const [
  raw,
  purchaseCarrierMigration,
  dailyClosingMigration,
  stockOutMigration,
  quotationViewOwnMigration,
  quotationToSaleMigration,
  stockOutReleaseQuantityMigration,
  receivablesMigration,
  customerReceivablesMigration,
  draftQuotationEditingMigration,
  nonSalesReceivablesMigration,
] = await Promise.all([
  readFile(rawUrl, "utf8"),
  readFile(purchaseCarrierMigrationUrl, "utf8"),
  readFile(dailyClosingMigrationUrl, "utf8"),
  readFile(stockOutMigrationUrl, "utf8"),
  readFile(quotationViewOwnMigrationUrl, "utf8"),
  readFile(quotationToSaleMigrationUrl, "utf8"),
  readFile(stockOutReleaseQuantityMigrationUrl, "utf8"),
  readFile(receivablesMigrationUrl, "utf8"),
  readFile(customerReceivablesMigrationUrl, "utf8"),
  readFile(draftQuotationEditingMigrationUrl, "utf8"),
  readFile(nonSalesReceivablesMigrationUrl, "utf8"),
]);

const withoutAuthForeignKey = raw.replace(
  /\n--\n-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT;[\s\S]*?ALTER TABLE ONLY public\.profiles\s+ADD CONSTRAINT profiles_id_fkey FOREIGN KEY \(id\) REFERENCES auth\.users\(id\) ON DELETE CASCADE;\s*/,
  "\n",
);

const nativeSchema = withoutAuthForeignKey.replace(
  /CREATE SCHEMA public;/i,
  "CREATE SCHEMA IF NOT EXISTS public;",
);

if (withoutAuthForeignKey === raw || /REFERENCES auth\.users/i.test(withoutAuthForeignKey)) {
  throw new Error("Unable to remove the Supabase Auth profile foreign key from the native schema.");
}

const bootstrap = `-- Generated native PostgreSQL 17 baseline for SEN Windows/LAN operation.\n-- Source: verified public schema; Supabase Auth ownership is replaced by local credentials.\n\ncreate extension if not exists pgcrypto;\n\ndo $$ begin\n  create role anon nologin;\nexception when duplicate_object then null; end $$;\ndo $$ begin\n  create role authenticated nologin;\nexception when duplicate_object then null; end $$;\ndo $$ begin\n  create role service_role nologin bypassrls;\nexception when duplicate_object then null; end $$;\ndo $$ begin\n  create role sen_app nologin bypassrls;\nexception when duplicate_object then null; end $$;\ngrant service_role to sen_app;\n\ncreate schema if not exists auth;\ncreate or replace function auth.uid() returns uuid language sql stable as $$\n  select coalesce(nullif(current_setting('sen.actor_id', true), '')::uuid, nullif(current_setting('request.jwt.claim.sub', true), '')::uuid)\n$$;\ncreate or replace function auth.role() returns text language sql stable as $$\n  select coalesce(nullif(current_setting('sen.actor_role', true), ''), nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', current_user)\n$$;\n\n`;

const bootstrapWithExtensions = bootstrap.replace(
  "create extension if not exists pgcrypto;",
  "create schema if not exists extensions;\ncreate extension if not exists pgcrypto with schema extensions;",
);

const grants = `\n-- Native application service access. Browser users never receive this role.\ngrant usage on schema public to service_role;\ngrant all privileges on all tables in schema public to service_role;\ngrant all privileges on all sequences in schema public to service_role;\ngrant execute on all functions in schema public to service_role;\nalter default privileges in schema public grant all on tables to service_role;\nalter default privileges in schema public grant all on sequences to service_role;\nalter default privileges in schema public grant execute on functions to service_role;\n`;

await writeFile(
  outputUrl,
  `${bootstrapWithExtensions}${nativeSchema.trim()}\n\n${purchaseCarrierMigration.trim()}\n\n${dailyClosingMigration.trim()}\n\n${stockOutMigration.trim()}\n\n${quotationViewOwnMigration.trim()}\n\n${quotationToSaleMigration.trim()}\n\n${stockOutReleaseQuantityMigration.trim()}\n\n${receivablesMigration.trim()}\n\n${customerReceivablesMigration.trim()}\n\n${draftQuotationEditingMigration.trim()}\n\n${nonSalesReceivablesMigration.trim()}\n${grants}`,
  "utf8",
);
console.log("Native PostgreSQL schema generated without the Supabase Auth foreign key.");
