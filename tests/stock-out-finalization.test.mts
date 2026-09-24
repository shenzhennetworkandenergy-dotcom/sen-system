import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  "supabase/migrations/202608220001_employee_stock_out_product_release.sql",
  "utf8",
);
const actions = await readFile("app/admin/sales/actions.ts", "utf8");
const salePage = await readFile("app/admin/sales/[saleId]/page.tsx", "utf8");
const saleData = await readFile("lib/sales/data.ts", "utf8");
const lineEditing = await readFile(
  "supabase/migrations/202607300007_sale_line_editing.sql",
  "utf8",
);

test("invoice finalization is a dedicated atomic RPC with an operation token", () => {
  assert.match(
    migration,
    /create\s+or\s+replace\s+function\s+public\.finalize_sale_invoice\s*\(\s*actor_profile_id\s+uuid\s*,\s*requested_order_id\s+uuid\s*,\s*requested_operation_id\s+uuid\s*,\s*requested_request_version\s+bigint\s*\)\s*returns\s+uuid/i,
  );
  assert.match(migration, /assert_actor_permission\(actor_profile_id,'sales\.create_invoice'\)/i);
  assert.match(migration, /sales_orders[\s\S]{0,180}for\s+update/i);
  assert.match(migration, /finalization_idempotency_key\s*=\s*requested_operation_id/i);
  assert.match(migration, /confirmed_at\s+is\s+null[\s\S]{0,160}not eligible/i);
  assert.match(migration, /grant\s+execute\s+on\s+function\s+public\.finalize_sale_invoice/i);
});

test("sale revisions reserve only the quantity not already physically released", () => {
  const updateStart = migration.toLowerCase().lastIndexOf("create or replace function public.update_sale_lines");
  const updateSql = migration.slice(updateStart, migration.indexOf("end $$;", updateStart) + 7);
  assert.match(updateSql, /physically_released_quantity/i);
  assert.doesNotMatch(updateSql, /update\s+public\.inventory_balances/i);
  assert.doesNotMatch(updateSql, /update\s+public\.inventory_reservations/i);
  assert.doesNotMatch(updateSql, /update\s+public\.order_serial_allocations/i);
  assert.doesNotMatch(
    updateSql,
    /update\s+public\.sale_documents[\s\S]*status='superseded'/i,
    "Saving an edit must preserve the last valid finalized invoice until atomic re-finalization succeeds.",
  );
  assert.doesNotMatch(
    updateSql,
    /remaining_quantity\s*:=\s*new_quantity-current_item\.shipped_quantity/i,
  );
  assert.match(lineEditing, /remaining_quantity\s*:=\s*new_quantity-current_item\.shipped_quantity/i);
  assert.match(migration, /desired_reservation:=sale_item\.quantity-item_released_quantity/i);
  assert.match(migration, /invoice_revision_unassigned/);
});

test("finalization reconciles reservations and blocks a revision below released quantity", () => {
  assert.match(
    migration,
    /(?:sale_item\.quantity|required_quantity)\s*<\s*(?:request_item\.)?released_quantity[\s\S]{0,220}already physically released/i,
  );
  assert.match(migration, /inventory_balances[\s\S]{0,220}for\s+update/i);
  assert.match(migration, /inventory_reservations[\s\S]{0,220}for\s+update/i);
  assert.match(migration, /balance\.available\s*<\s*reservation_delta/i);
  assert.match(migration, /set\s+reserved\s*=\s*reserved\s*\+\s*reservation_delta/i);
});

test("finalization keeps one request and records immutable synchronized revisions", () => {
  assert.match(
    migration,
    /insert\s+into\s+public\.sales_stock_out_requests[\s\S]{0,900}on\s+conflict\s*\(sales_order_id\)/i,
  );
  assert.match(migration, /insert\s+into\s+public\.sales_stock_out_request_items/i);
  assert.match(migration, /insert\s+into\s+public\.sales_stock_out_request_revisions/i);
  assert.match(migration, /insert\s+into\s+public\.sales_stock_out_request_revision_items/i);
  assert.match(migration, /invoice_revision_pending\s*=\s*false/i);
  assert.match(migration, /status='superseded'[\s\S]{0,240}document_type='invoice'/i);
  assert.match(migration, /removed_request_item[\s\S]{0,600}required_quantity=0/i);
  assert.match(migration, /sales_stock_out_request_revision_items[\s\S]{0,600}removed_request_item/i);
});

test("superseding a generated invoice blocks release until the next finalization", () => {
  assert.match(
    migration,
    /create\s+or\s+replace\s+function\s+public\.mark_stock_out_invoice_revision_pending/i,
  );
  assert.match(
    migration,
    /create\s+trigger\s+sale_documents_mark_stock_out_revision_pending/i,
  );
  assert.match(migration, /invoice_revision_pending=true/i);
});

test("invoice form supplies a stable operation token and delivery challans keep their existing RPC", () => {
  assert.match(salePage, /randomUUID\(\)/);
  assert.match(
    salePage,
    /<input[^>]+type="hidden"[^>]+name="operation_id"[^>]+value=\{invoiceOperationId\}/,
  );
  assert.match(
    actions,
    /generateSaleDocumentAction\(saleId:\s*string,\s*type:[\s\S]{0,100},\s*form:\s*FormData\)/,
  );
  assert.match(actions, /form\.get\("operation_id"\)/);
  assert.match(actions, /type\s*===\s*"invoice"[\s\S]{0,900}finalize_sale_invoice/);
  assert.match(actions, /requested_operation_id:\s*operationId/);
  assert.match(actions, /requested_request_version:\s*requestVersion/);
  assert.match(salePage, /name="request_version"/);
  assert.match(migration, /requested_request_version\s+is\s+distinct\s+from[\s\S]{0,180}request_row\.version/i);
  assert.match(
    migration,
    /create or replace function public\.finalize_sale_invoice\(\s*actor_profile_id uuid,\s*requested_order_id uuid,\s*requested_operation_id uuid\s*\)[\s\S]{0,500}public\.finalize_sale_invoice\([\s\S]{0,180}request_version/i,
    "The additive migration must keep the previous three-argument finalization entry point compatible.",
  );
  assert.match(actions, /generate_sale_document[\s\S]{0,180}requested_type:\s*type/);
});

test("successful finalization exposes request state and refreshes the employee queue", () => {
  assert.match(saleData, /sales_stock_out_requests/);
  assert.match(actions, /revalidatePath\("\/employee\/inventory\/stock-out"\)/);
  assert.match(actions, /revalidatePath\("\/api\/employee\/inventory\/work-counts"\)/);
});
