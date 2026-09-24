import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  assertReceiptSnapshotShape,
  calculateMoneyReceiptHistory,
  type MoneyReceiptSnapshot,
} from "../lib/sales/money-receipt.ts";
import {
  canAccessSale,
  resolveSalesViewScope,
} from "../lib/sales/money-receipt-access.ts";

const MONEY_RECEIPT_MIGRATION_PATH = "supabase/migrations/202608310001_sales_money_receipts.sql";
const MONEY_RECEIPT_SQL_TEST_PATH = "supabase/tests/sales_money_receipt.sql";
const MONEY_RECEIPT_PAGE_PATH = "app/admin/sales/[saleId]/payments/[paymentId]/receipt/page.tsx";
const MONEY_RECEIPT_DOCUMENT_PATH = "components/sales/MoneyReceiptDocument.tsx";

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  Object.freeze(value);
  for (const item of Object.values(value as Record<string, unknown>)) {
    if (item && typeof item === "object" && !Object.isFrozen(item)) {
      deepFreeze(item);
    }
  }
  return value;
}

test("calculates received money receipt history in payment order and ignores non-received rows", () => {
  const payments = [
    { id: "pay-3", amount: 20000, status: "received", created_at: "2026-08-31T10:02:00Z" },
    { id: "pay-1", amount: 50000, status: "received", created_at: "2026-08-31T10:00:00Z" },
    { id: "pay-void", amount: 9999, status: "voided", created_at: "2026-08-31T10:01:00Z" },
    { id: "pay-refund", amount: 5000, status: "refunded", created_at: "2026-08-31T10:01:00Z" },
    { id: "pay-2", amount: 30000, status: "received", created_at: "2026-08-31T10:01:00Z" },
  ];

  assert.deepEqual(calculateMoneyReceiptHistory({
    saleTotal: 100000,
    paymentId: "pay-1",
    payments,
  }), {
    previouslyPaid: 0,
    thisPayment: 50000,
    totalPaid: 50000,
    remaining: 50000,
    status: "PARTIAL PAYMENT",
  });

  assert.deepEqual(calculateMoneyReceiptHistory({
    saleTotal: 100000,
    paymentId: "pay-2",
    payments,
  }), {
    previouslyPaid: 50000,
    thisPayment: 30000,
    totalPaid: 80000,
    remaining: 20000,
    status: "PARTIAL PAYMENT",
  });

  assert.deepEqual(calculateMoneyReceiptHistory({
    saleTotal: 100000,
    paymentId: "pay-3",
    payments,
  }), {
    previouslyPaid: 80000,
    thisPayment: 20000,
    totalPaid: 100000,
    remaining: 0,
    status: "FULL PAYMENT",
  });
});

test("uses payment id as the money receipt history tie-breaker for identical creation times", () => {
  const payments = [
    { id: "pay-b", amount: 30000, status: "received", created_at: "2026-08-31T10:00:00Z" },
    { id: "pay-a", amount: 50000, status: "received", created_at: "2026-08-31T10:00:00Z" },
    { id: "pay-c", amount: 20000, status: "received", created_at: "2026-08-31T10:01:00Z" },
  ];

  assert.deepEqual(calculateMoneyReceiptHistory({
    saleTotal: 100000,
    paymentId: "pay-b",
    payments,
  }), {
    previouslyPaid: 50000,
    thisPayment: 30000,
    totalPaid: 80000,
    remaining: 20000,
    status: "PARTIAL PAYMENT",
  });
});

test("floors receipt remaining balance at zero when payments exceed the sale total", () => {
  const history = calculateMoneyReceiptHistory({
    saleTotal: "60000",
    paymentId: "pay-3",
    payments: [
      { id: "pay-1", amount: "50000", status: "received", created_at: "2026-08-31T10:00:00Z" },
      { id: "pay-2", amount: "30000", status: "received", created_at: "2026-08-31T10:01:00Z" },
      { id: "pay-3", amount: "20000", status: "received", created_at: "2026-08-31T10:02:00Z" },
    ],
  });

  assert.deepEqual(history, {
    previouslyPaid: 80000,
    thisPayment: 20000,
    totalPaid: 100000,
    remaining: 0,
    status: "FULL PAYMENT",
  });
});

test("sales money receipt migration keeps receipts optional, immutable, scoped, and side-effect free", () => {
  assert.ok(
    existsSync(MONEY_RECEIPT_MIGRATION_PATH),
    "sales money receipt migration must exist",
  );
  assert.ok(
    existsSync(MONEY_RECEIPT_SQL_TEST_PATH),
    "sales money receipt SQL acceptance test must exist",
  );

  const migration = readFileSync(MONEY_RECEIPT_MIGRATION_PATH, "utf8");
  assert.match(migration, /create sequence if not exists public\.sale_money_receipt_number_seq/i);
  assert.match(migration, /create or replace function public\.next_sale_money_receipt_number\(\)\s*returns text/i);
  assert.match(migration, /SEN-MR-[\s\S]*YYYYMMDD[\s\S]*sale_money_receipt_number_seq/i);
  assert.match(migration, /timezone\('Asia\/Dhaka',pg_catalog\.clock_timestamp\(\)\)/i);
  assert.match(migration, /create table if not exists public\.sale_money_receipts/i);
  assert.match(
    migration,
    /payment_id uuid not null unique references public\.sale_payments\(id\) on delete restrict/i,
  );
  assert.match(migration, /order_id uuid not null references public\.sales_orders\(id\) on delete restrict/i);
  assert.match(migration, /receipt_number text not null unique/i);
  assert.match(migration, /receipt_date date not null/i);
  assert.match(migration, /snapshot jsonb not null/i);
  assert.match(migration, /generated_by uuid not null references public\.profiles\(id\) on delete restrict/i);
  assert.match(migration, /created_at timestamptz not null default now\(\)/i);
  assert.match(migration, /jsonb_typeof\(snapshot\)='object'/i);
  assert.match(migration, /create or replace function public\.sale_money_receipt_amount_in_words/i);
  assert.match(migration, /create or replace function public\.reject_sale_money_receipt_mutation/i);
  assert.match(migration, /create or replace function public\.validate_sale_money_receipt_insert/i);
  assert.match(migration, /create or replace function public\.build_sale_money_receipt_snapshot/i);
  assert.match(migration, /before insert on public\.sale_money_receipts/i);
  assert.match(migration, /payment\.order_id is distinct from requested_order_id/i);
  assert.match(migration, /payment\.status <> 'received'/i);
  assert.match(migration, /new\.snapshot is distinct from expected_snapshot/i);
  assert.match(migration, /Money receipt snapshot must be generated from saved sale payment/i);
  const insertGuard = migration.slice(
    migration.indexOf("create or replace function public.validate_sale_money_receipt_insert"),
    migration.indexOf("drop trigger if exists reject_sale_money_receipt_mutation"),
  );
  assert.match(insertGuard, /security\s+invoker/i);
  assert.match(insertGuard, /controlled generator/i);
  assert.match(insertGuard, /to_regprocedure\('public\.generate_sale_money_receipt\(uuid,uuid\)'\)/i);
  assert.match(migration, /before update or delete on public\.sale_money_receipts/i);
  assert.match(migration, /'sales\.money_receipt'/);
  assert.doesNotMatch(migration, /permission_templates/i);
  assert.match(migration, /alter table public\.sale_money_receipts enable row level security/i);
  assert.match(migration, /create policy "staff read sale money receipts"/i);
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
  assert.match(migration, /current_user_has_permission\('sales\.view'\)/i);
  assert.match(migration, /current_user_has_permission\('sales\.view_all'\)/i);
  assert.match(migration, /current_user_has_permission\('sales\.view_own'\)/i);
  assert.match(migration, /grant select on public\.sale_money_receipts to authenticated,service_role/i);
  assert.match(migration, /revoke all privileges on table public\.sale_money_receipts from public,anon,authenticated,service_role/i);
  assert.doesNotMatch(migration, /grant all on public\.sale_money_receipts to service_role/i);
  assert.match(migration, /revoke all on function public\.generate_sale_money_receipt\(uuid,uuid\) from public,anon,authenticated/i);
  assert.match(migration, /grant execute on function public\.generate_sale_money_receipt\(uuid,uuid\) to service_role/i);
  assert.match(migration, /revoke all on function public\.next_sale_money_receipt_number\(\) from public,anon,authenticated,service_role/i);
  assert.match(migration, /revoke all on function public\.sale_money_receipt_amount_in_words\(numeric,text\) from public,anon,authenticated,service_role/i);
  assert.doesNotMatch(migration, /grant execute on function public\.next_sale_money_receipt_number\(\) to service_role/i);
  assert.doesNotMatch(migration, /grant execute on function public\.sale_money_receipt_amount_in_words\(numeric,text\) to service_role/i);
  assert.match(migration, /revoke all on sequence public\.sale_money_receipt_number_seq from public,anon,authenticated,service_role/i);
  assert.match(migration, /assert_actor_permission\(actor_profile_id,'sales\.money_receipt'\)/i);
  assert.match(migration, /permission_key in \('sales\.view','sales\.view_all'\)/i);
  assert.match(migration, /permission_key='sales\.view_own'/i);
  assert.match(migration, /order by created_at,id/i);
  assert.match(migration, /nullif\(sale\.billing_address_snapshot,'\{\}'::jsonb\)/i);
  assert.match(migration, /on conflict \(payment_id\) do nothing/i);

  const receiptRpc = migration.slice(
    migration.indexOf("create or replace function public.generate_sale_money_receipt"),
    migration.indexOf("revoke all on function public.generate_sale_money_receipt"),
  );
  assert.doesNotMatch(receiptRpc, /record_sale_payment/i);
  assert.doesNotMatch(receiptRpc, /cashbook_entries/i);
  assert.doesNotMatch(receiptRpc, /journal_entries/i);
  assert.doesNotMatch(receiptRpc, /inventory_/i);
  assert.doesNotMatch(receiptRpc, /generate_sale_document/i);
  assert.doesNotMatch(receiptRpc, /delivery_challan/i);

  const acceptance = readFileSync(MONEY_RECEIPT_SQL_TEST_PATH, "utf8");
  assert.match(acceptance, /set local role authenticated/i);
  assert.match(acceptance, /set local role anon/i);
  assert.match(acceptance, /admin_set_profile_permissions/i);
  assert.match(acceptance, /Own-scope staff could not read only their own Money Receipts/i);
  assert.match(acceptance, /set_config\('sen\.actor_id','',true\)/i);
  const databaseVerifier = readFileSync("scripts/verify-sales-money-receipt-database.mjs", "utf8");
  assert.match(databaseVerifier, /Promise\.all\(\[callGenerator\(\), callGenerator\(\)\]\)/i);
  assert.match(databaseVerifier, /has_table_privilege\('anon'/i);
  assert.match(databaseVerifier, /has_function_privilege/i);
  assert.match(databaseVerifier, /set local role service_role/i);
});

test("native schema builder appends the money receipt migration after existing Sales overlays", () => {
  const builder = readFileSync("scripts/build-native-schema.mjs", "utf8");
  const schema = readFileSync("database/native/schema.sql", "utf8");
  const nativeSeed = readFileSync("database/native/seed.sql", "utf8");

  assert.match(builder, /202608310001_sales_money_receipts\.sql/);
  const supplierOverlay = builder.indexOf("supplierShipmentTrackingCorrectionMigration.trim()");
  const receiptOverlay = builder.indexOf("salesMoneyReceiptMigration.trim()");
  assert.ok(
    supplierOverlay >= 0 && receiptOverlay > supplierOverlay,
    "the receipt migration must be appended after the existing 20260823 overlays",
  );

  assert.match(schema, /create sequence if not exists public\.sale_money_receipt_number_seq/i);
  assert.match(schema, /create table if not exists public\.sale_money_receipts/i);
  assert.match(schema, /payment_id uuid not null unique references public\.sale_payments\(id\)/i);
  assert.match(schema, /create or replace function public\.generate_sale_money_receipt/i);
  assert.match(schema, /sales\.money_receipt/);
  assert.match(schema, /create or replace function public\.next_sale_money_receipt_number/i);
  assert.match(nativeSeed, /sales\.money_receipt/);
  const supplierMarker = schema.indexOf("correct_purchase_inbound_shipment_tracking");
  const receiptMarker = schema.indexOf("create sequence if not exists public.sale_money_receipt_number_seq");
  assert.ok(
    supplierMarker >= 0 && receiptMarker > supplierMarker,
    "the generated schema must place receipts after the existing 20260823 overlays",
  );
});

test("sale payment rows expose an optional receipt action without changing payment entry", () => {
  const actions = readFileSync("app/admin/sales/actions.ts", "utf8");
  const data = readFileSync("lib/sales/data.ts", "utf8");
  const page = readFileSync("app/admin/sales/[saleId]/page.tsx", "utf8");
  const actionComponent = readFileSync("components/sales/MoneyReceiptAction.tsx", "utf8");

  assert.match(actions, /export async function generateMoneyReceiptAction/i);
  assert.match(actions, /requirePermission\("sales\.money_receipt"\)/i);
  assert.match(actions, /generate_sale_money_receipt/i);
  assert.match(actions, /revalidatePath\([^)]*saleId/i);
  assert.match(actions, /payments\/\$\{paymentId\}\/receipt/i);
  assert.doesNotMatch(actions.slice(actions.indexOf("export async function generateMoneyReceiptAction")), /record_sale_payment/i);
  assert.match(data, /from\("sale_money_receipts"\)/i);
  assert.match(data, /moneyReceipt/i);
  assert.match(page, /recordPaymentAction\.bind\(null, saleId\)/i);
  for (const fieldName of ["amount", "payment_date", "reference_number", "internal_note"]) {
    assert.match(page, new RegExp(`name=\\"${fieldName}\\"`));
  }
  assert.match(page, /<th>Receipt<\/th>/i);
  assert.match(page, /Generate Money Receipt/i);
  assert.match(page, /View Money Receipt/i);
  assert.match(actionComponent, /useFormStatus/i);
  assert.doesNotMatch(actionComponent, /name=\\"(amount|payment_date|method|reference_number)\\"/i);
});

test("receipt route and document render only an authorized immutable snapshot", () => {
  const routePath = "app/admin/sales/[saleId]/payments/[paymentId]/receipt/page.tsx";
  const route = readFileSync(routePath, "utf8");
  const document = readFileSync("components/sales/MoneyReceiptDocument.tsx", "utf8");

  assert.match(route, /params:\s*Promise<\{\s*saleId:\s*string;\s*paymentId:\s*string\s*\}>/i);
  assert.match(route, /connection\(\)/i);
  assert.match(route, /requirePermission\("sales\.money_receipt"\)/i);
  assert.match(route, /resolveSalesViewScope/i);
  assert.match(route, /canAccessSale/i);
  assert.match(route, /eq\("payment_id",\s*paymentId\)/i);
  assert.match(route, /eq\("order_id",\s*saleId\)/i);
  assert.match(route, /assertReceiptSnapshotShape/i);
  assert.match(route, /MoneyReceiptDocument/i);
  assert.match(route, /notFound\(\)/i);
  assert.doesNotMatch(route, /sum\(|record_sale_payment|cashbook_entries|inventory_|generate_sale_document/i);

  assert.match(document, /MONEY RECEIPT/i);
  assert.match(document, /PrintDocumentButton/i);
  assert.match(document, /sen-official-logo|siteConfig\.brandAsset\.logo/i);
  assert.match(document, /A4/i);
  for (const label of ["Previously Paid", "This Payment", "Total Paid", "Remaining", "Amount in words", "Received by"]) {
    assert.match(document, new RegExp(label.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), "i"));
  }
  assert.match(document, /summary\.status/i);
  assert.match(document, /PARTIAL PAYMENT/i);
  assert.match(document, /FULL PAYMENT/i);
  assert.match(document, /signature/i);
  assert.doesNotMatch(document, /internal_note|cashbook|journal_entries|inventory_movements|record_sale_payment/i);
});

test("rounds receipt amount words before splitting whole and poisha with safe carry", () => {
  const migration = readFileSync(MONEY_RECEIPT_MIGRATION_PATH, "utf8");
  const amountWordsFn = migration.slice(
    migration.indexOf("create or replace function public.sale_money_receipt_amount_in_words"),
    migration.indexOf("create table if not exists public.sale_money_receipts"),
  );

  assert.match(amountWordsFn, /amount_rounded\s+numeric\s*:=\s*round\(requested_amount,\s*2\)/i);
  assert.match(amountWordsFn, /amount_abs\s+numeric\s*:=\s*abs\(amount_rounded\)/i);
  assert.match(
    amountWordsFn,
    /if\s+poisha\s*>=\s*100\s+then[\s\S]{0,240}whole_amount\s*:=\s*whole_amount\s*\+\s*poisha\s*\/\s*100[\s\S]{0,240}poisha\s*:=\s*poisha\s*%\s*100/i,
  );
  assert.match(amountWordsFn, /if\s+amount_rounded\s*<\s*0\s+then\s+result_words\s*:=\s*'Minus '/i);
});

test("formats non-BDT receipt amounts as number words instead of raw numerics", () => {
  const migration = readFileSync(MONEY_RECEIPT_MIGRATION_PATH, "utf8");
  const amountWordsFn = migration.slice(
    migration.indexOf("create or replace function public.sale_money_receipt_amount_in_words"),
    migration.indexOf("create table if not exists public.sale_money_receipts"),
  );

  assert.match(amountWordsFn, /currency_label\s+text/i);
  assert.match(amountWordsFn, /fractional_label\s+text/i);
  assert.match(amountWordsFn, /'Cents'/i);
  assert.doesNotMatch(
    amountWordsFn,
    /if\s+currency_code\s+is\s+null\s+or\s+currency_code\s*<>\s*'BDT'[\s\S]{0,300}to_char\(requested_amount/i,
  );
});

test("money receipt reads require the dedicated permission and latest invoice revision", () => {
  const migration = readFileSync(MONEY_RECEIPT_MIGRATION_PATH, "utf8");
  const policy = migration.slice(
    migration.indexOf('create policy "staff read sale money receipts"'),
    migration.indexOf("grant select on public.sale_money_receipts"),
  );
  assert.match(
    policy,
    /using\s*\(\s*public\.current_user_has_permission\('sales\.money_receipt'\)\s+and\s*\(/i,
  );

  const receiptRpc = migration.slice(
    migration.indexOf("create or replace function public.generate_sale_money_receipt"),
    migration.indexOf("revoke all on function public.generate_sale_money_receipt"),
  );
  assert.match(migration, /order by revision_number\s+desc\s*,\s*created_at\s+desc/i);
  assert.match(receiptRpc, /build_sale_money_receipt_snapshot/i);
});

test("resolves sales receipt scope for admin, broad employees, own employees, and missing permission", () => {
  assert.equal(resolveSalesViewScope("admin", new Set()), "all");
  assert.equal(resolveSalesViewScope("employee", new Set(["sales.view"])), "all");
  assert.equal(resolveSalesViewScope("employee", new Set(["sales.view_all"])), "all");
  assert.equal(resolveSalesViewScope("employee", new Set(["sales.view_own"])), "own");
  assert.equal(resolveSalesViewScope("employee", new Set()), null);
});

test("checks sale access using the resolved scope and creator ownership", () => {
  assert.equal(canAccessSale("all", "actor-1", null), true);
  assert.equal(canAccessSale("own", "actor-1", "actor-1"), true);
  assert.equal(canAccessSale("own", "actor-1", "actor-2"), false);
  assert.equal(canAccessSale(null, "actor-1", "actor-1"), false);
});

test("asserts the immutable money receipt snapshot shape", () => {
  const snapshot: MoneyReceiptSnapshot = deepFreeze({
    receipt_number: "SEN-MR-20260831-00001",
    receipt_date: "2026-08-31",
    generated_at: "2026-08-31T10:30:00.000Z",
    sale: {
      id: "sale-1",
      order_number: "SO-2026-0001",
      total_amount: 100000,
    },
    customer: {
      id: "customer-1",
      full_name: "Acme Customer",
    },
    address: {
      line_1: "42 Industrial Road",
      city: "Dhaka",
    },
    payment: {
      id: "pay-3",
      amount: 20000,
      status: "received",
    },
    summary: {
      previously_paid: 80000,
      this_payment: 20000,
      total_paid: 100000,
      remaining: 0,
      status: "FULL PAYMENT",
    },
    amount_in_words: "Bangladeshi Taka One Hundred Thousand Only",
  });

  assert.doesNotThrow(() => assertReceiptSnapshotShape(snapshot));
  assert.throws(() => assertReceiptSnapshotShape({
    ...snapshot,
    payment: undefined,
  }), /payment/i);
  assert.throws(() => assertReceiptSnapshotShape({
    ...snapshot,
    summary: undefined,
  }), /summary/i);
});

test("money receipt page reads only the immutable receipt snapshot and enforces payment scope", () => {
  const page = readFileSync(MONEY_RECEIPT_PAGE_PATH, "utf8");

  assert.match(page, /await connection\(\)/);
  assert.match(page, /params:\s*Promise<\{ saleId: string; paymentId: string \}>/);
  assert.match(page, /requirePermission\("sales\.money_receipt"\)/);
  assert.match(page, /resolveSalesViewScope\(profile\.role, permissions\)/);
  assert.match(page, /canAccessSale\(scope, profile\.id, sale\.created_by \?\? null\)/);
  assert.match(page, /sale_money_receipts/);
  assert.match(page, /assertReceiptSnapshotShape\(data\.snapshot\)/);
  assert.match(page, /MoneyReceiptDocument/);
  assert.doesNotMatch(page, /sale_payments/);
  assert.doesNotMatch(page, /paid_amount/);
  assert.doesNotMatch(page, /sum\(/);
});

test("money receipt document renders the official SEN print layout and controls", () => {
  const document = readFileSync(MONEY_RECEIPT_DOCUMENT_PATH, "utf8");

  assert.match(document, /siteConfig\.brandAsset\.logo/);
  assert.match(document, /siteConfig\.company\.fullName/);
  assert.match(document, /siteConfig\.company\.logoAlt/);
  assert.match(document, /PrintDocumentButton/);
  assert.match(document, /MONEY RECEIPT/);
  assert.match(document, /amount_in_words/);
  assert.match(document, /invoice_number/);
  assert.match(document, /received_by/);
  assert.match(document, /@page \{ size: A4 portrait; margin: 0; \}/);
  assert.match(document, /\.sen-money-receipt-actions/);
  assert.doesNotMatch(document, /DashboardShell/);
});
