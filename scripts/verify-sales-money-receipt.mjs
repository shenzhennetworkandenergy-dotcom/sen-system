import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const exists = (file) => existsSync(path.join(root, file));
const files = [
  "supabase/migrations/202608310001_sales_money_receipts.sql",
  "supabase/tests/sales_money_receipt.sql",
  "lib/sales/money-receipt.ts",
  "lib/sales/money-receipt-access.ts",
  "components/sales/MoneyReceiptAction.tsx",
  "app/admin/sales/actions.ts",
  "app/admin/sales/[saleId]/page.tsx",
  "app/admin/sales/[saleId]/payments/[paymentId]/receipt/page.tsx",
  "components/sales/MoneyReceiptDocument.tsx",
  "lib/sales/data.ts",
  "scripts/build-native-schema.mjs",
  "database/native/schema.sql",
  "database/native/seed.sql",
  "docs/SALES.md",
  "package.json",
  "scripts/verify-sales-money-receipt-database.mjs",
];

for (const file of files) {
  assert.ok(exists(file), `Missing Sales money receipt file: ${file}`);
}

const migration = read(files[0]);
const helper = read(files[2]);
const access = read(files[3]);
const action = read(files[5]);
const salePage = read(files[6]);
const receiptPage = read(files[7]);
const receiptDocument = read(files[8]);
const data = read(files[9]);
const builder = read(files[10]);
const schema = read(files[11]);
const seed = read(files[12]);
const docs = read(files[13]);
const packageJson = JSON.parse(read(files[14]));
const databaseVerifier = read(files[15]);
const acceptance = read(files[1]);

for (const token of [
  "create sequence if not exists public.sale_money_receipt_number_seq",
  "create or replace function public.next_sale_money_receipt_number()",
  "create or replace function public.sale_money_receipt_amount_in_words",
  "create table if not exists public.sale_money_receipts",
  "create or replace function public.build_sale_money_receipt_snapshot",
  "payment_id uuid not null unique references public.sale_payments(id) on delete restrict",
  "receipt_number text not null unique",
  "receipt_date date not null",
  "snapshot jsonb not null",
  "generated_by uuid not null references public.profiles(id) on delete restrict",
  "create or replace function public.validate_sale_money_receipt_insert()",
  "before insert on public.sale_money_receipts",
  "payment.order_id is distinct from requested_order_id",
  "payment.status <> 'received'",
  "before update or delete on public.sale_money_receipts",
  "sales.money_receipt",
  "grant execute on function public.generate_sale_money_receipt(uuid,uuid) to service_role",
]) {
  assert.match(migration, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
}

assert.match(migration, /current_user_has_permission\('sales\.money_receipt'\)/i);
assert.match(migration, /current_user_has_permission\('sales\.view'\)/i);
assert.match(migration, /current_user_has_permission\('sales\.view_all'\)/i);
assert.match(migration, /current_user_has_permission\('sales\.view_own'\)/i);
assert.match(migration, /can_current_user_view_sale_money_receipt\(order_id\)/i);
const scopeHelper = migration.slice(
  migration.indexOf("create or replace function public.can_current_user_view_sale_money_receipt"),
  migration.indexOf('drop policy if exists "staff read sale money receipts"'),
);
assert.match(scopeHelper, /security\s+definer/i);
assert.match(scopeHelper, /auth\.uid\(\)/i);
assert.match(scopeHelper, /public\.sales_orders/i);
assert.match(scopeHelper, /o\.created_by=auth\.uid\(\)/i);
assert.match(migration, /revoke all on function public\.can_current_user_view_sale_money_receipt\(uuid\) from public,anon/i);
assert.match(migration, /grant execute on function public\.can_current_user_view_sale_money_receipt\(uuid\) to authenticated,service_role/i);
assert.match(migration, /timezone\('Asia\/Dhaka',pg_catalog\.clock_timestamp\(\)\)/i);
assert.match(migration, /assert_actor_permission\(actor_profile_id,'sales\.money_receipt'\)/i);
assert.match(migration, /order by revision_number desc,\s*created_at desc/i);
assert.match(migration, /nullif\(sale\.billing_address_snapshot,'\{\}'::jsonb\)/i);
assert.match(migration, /Money receipt snapshot must be generated from saved sale payment/i);
assert.match(migration, /new\.snapshot is distinct from expected_snapshot/i);
const insertGuard = migration.slice(
  migration.indexOf("create or replace function public.validate_sale_money_receipt_insert"),
  migration.indexOf("drop trigger if exists reject_sale_money_receipt_mutation"),
);
assert.match(insertGuard, /security\s+invoker/i);
assert.match(insertGuard, /controlled generator/i);
assert.match(insertGuard, /to_regprocedure\('public\.generate_sale_money_receipt\(uuid,uuid\)'\)/i);
assert.match(migration, /on conflict \(payment_id\) do nothing/i);
assert.match(migration, /revoke all privileges on table public\.sale_money_receipts from public,anon,authenticated,service_role/i);
assert.doesNotMatch(migration, /grant all on public\.sale_money_receipts to service_role/i);
assert.match(migration, /revoke all on function public\.next_sale_money_receipt_number\(\) from public,anon,authenticated,service_role/i);
assert.match(migration, /revoke all on function public\.sale_money_receipt_amount_in_words\(numeric,text\) from public,anon,authenticated,service_role/i);
assert.doesNotMatch(migration, /grant execute on function public\.next_sale_money_receipt_number\(\) to service_role/i);
assert.doesNotMatch(migration, /grant execute on function public\.sale_money_receipt_amount_in_words\(numeric,text\) to service_role/i);
assert.match(migration, /revoke all on sequence public\.sale_money_receipt_number_seq from public,anon,authenticated,service_role/i);
const receiptRpc = migration.slice(
  migration.indexOf("create or replace function public.generate_sale_money_receipt"),
  migration.indexOf("revoke all on function public.generate_sale_money_receipt"),
);
assert.doesNotMatch(receiptRpc, /record_sale_payment|cashbook_entries|journal_entries|inventory_|shipment|delivery_challan/i);

assert.match(helper, /calculateMoneyReceiptHistory/);
assert.match(helper, /assertReceiptSnapshotShape/);
assert.match(helper, /previouslyPaid/);
assert.match(helper, /FULL PAYMENT/);

assert.match(access, /resolveSalesViewScope/);
assert.match(access, /canAccessSale/);

const generateReceiptAction = action.slice(
  action.indexOf("export async function generateMoneyReceiptAction"),
  action.indexOf("export async function generateSaleDocumentAction"),
);
assert.match(generateReceiptAction, /requirePermission\("sales\.money_receipt"\)/i);
assert.match(generateReceiptAction, /canAccessSale\(scope, profile\.id, sale\.data\.created_by\)/i);
assert.match(generateReceiptAction, /db\.rpc\("generate_sale_money_receipt"/);
assert.match(generateReceiptAction, /revalidatePath\(`\/admin\/sales\/\$\{saleId\}\/payments\/\$\{paymentId\}\/receipt`\)/);
assert.doesNotMatch(generateReceiptAction, /record_sale_payment|cashbook_entries|journal_entries|inventory_|delivery_challan/i);

assert.match(salePage, /MoneyReceiptAction/);
assert.match(salePage, /Generate Money Receipt/);
assert.match(salePage, /View Money Receipt/);
assert.match(salePage, /Print \/ PDF/);
assert.match(salePage, /payment\.moneyReceipt/);

assert.match(receiptPage, /requirePermission\("sales\.money_receipt"\)/i);
assert.match(receiptPage, /canAccessSale\(scope, profile\.id, sale\.created_by \?\? null\)/);
assert.match(receiptPage, /assertReceiptSnapshotShape\(data\.snapshot\)/);
assert.match(receiptPage, /MoneyReceiptDocument/);
assert.doesNotMatch(receiptPage, /name="amount"|name="payment_date"|name="method"|name="reference_number"/i);

assert.match(data, /sale_money_receipts/);
assert.match(data, /moneyReceipt/);

assert.match(receiptDocument, /PrintDocumentButton/);
assert.match(receiptDocument, /siteConfig\.brandAsset\.logo/);
assert.match(receiptDocument, /siteConfig\.company\.fullName/);
assert.match(receiptDocument, /siteConfig\.company\.logoAlt/);
assert.match(receiptDocument, /A4/);
assert.match(receiptDocument, /MONEY RECEIPT/);
assert.match(receiptDocument, /amount_in_words/);
assert.match(receiptDocument, /invoice_number/);
assert.match(receiptDocument, /received_by/);
assert.match(receiptDocument, /sen-money-receipt-actions/);
assert.doesNotMatch(receiptDocument, /DashboardShell/);

assert.match(builder, /202608310001_sales_money_receipts\.sql/);
assert.match(builder, /supplierShipmentTrackingCorrectionMigration\.trim\(\)[\s\S]*salesMoneyReceiptMigration\.trim\(\)/);
assert.match(schema, /sale_money_receipts/);
assert.match(schema, /generate_sale_money_receipt/);
assert.match(seed, /sales\.money_receipt/);

for (const table of [
  "sale_payments",
  "cashbook_entries",
  "journal_entries",
  "inventory_movements",
  "inventory_balances",
  "shipments",
  "inventory_reservations",
  "order_serial_allocations",
  "order_status_events",
  "sale_documents",
]) {
  assert.match(acceptance, new RegExp(`before_${table}`));
}

assert.match(databaseVerifier, /SALES_MONEY_RECEIPT_TEST_DATABASE_URL/);
assert.match(databaseVerifier, /127\.0\.0\.1/);
assert.match(databaseVerifier, /rollback-only/i);
assert.match(databaseVerifier, /has_table_privilege\('service_role'/i);
assert.match(databaseVerifier, /immutable Money Receipts/i);
assert.match(databaseVerifier, /Promise\.all\(\[callGenerator\(\), callGenerator\(\)\]\)/i);

assert.match(acceptance, /set local role authenticated/i);
assert.match(acceptance, /set local role anon/i);
assert.match(acceptance, /admin_set_profile_permissions/i);
assert.match(acceptance, /Own-scope staff could not read only their own Money Receipts/i);

assert.match(docs, /Money Receipt/);
assert.match(docs, /sales\.money_receipt/);
assert.match(docs, /Print \/ PDF/);

assert.equal(packageJson.scripts["test:sales-money-receipt"],
  "node scripts/verify-sales-money-receipt.mjs && node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/sales-money-receipt.test.mts");
assert.equal(packageJson.scripts["test:sales-money-receipt:db"],
  "node scripts/verify-sales-money-receipt-database.mjs");

console.log("Sales money receipt static verification passed.");
