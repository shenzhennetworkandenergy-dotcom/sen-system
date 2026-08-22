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
const outputUrl = new URL("../database/native/schema.sql", import.meta.url);
const [raw, purchaseCarrierMigration, dailyClosingMigration, stockOutMigration] = await Promise.all([
  readFile(rawUrl, "utf8"),
  readFile(purchaseCarrierMigrationUrl, "utf8"),
  readFile(dailyClosingMigrationUrl, "utf8"),
  readFile(stockOutMigrationUrl, "utf8"),
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
  `${bootstrapWithExtensions}${nativeSchema.trim()}\n\n${purchaseCarrierMigration.trim()}\n\n${dailyClosingMigration.trim()}\n\n${stockOutMigration.trim()}\n${grants}`,
  "utf8",
);
console.log("Native PostgreSQL schema generated without the Supabase Auth foreign key.");
