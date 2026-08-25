import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/202608250002_customer_receivables_phase2.sql", import.meta.url),
  "utf8",
).catch(() => "");

test("adds only nullable structured Sales commercial-term fields with narrow constraints", () => {
  assert.match(migration, /^\s*begin\s*;/i);
  assert.match(migration, /commit\s*;\s*$/i);
  for (const column of ["payment_terms_type", "credit_period_days", "payment_due_date"]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}\\b`, "i"));
  }
  assert.match(migration, /payment_terms_type is null or payment_terms_type in \('immediate','partial','credit'\)/i);
  assert.match(migration, /credit_period_days between 1 and 3650/i);
  assert.doesNotMatch(migration, /add column if not exists (?:payment_terms_type|credit_period_days|payment_due_date)[^;]*default/i);
  assert.doesNotMatch(migration, /where\s+payment_(?:terms_type|due_date)\s+is\s+null/i);
});

test("commercial-term updates are atomic, idempotent, audited, and Sales-scope protected", () => {
  assert.match(migration, /create or replace function public\.update_sale_commercial_terms\(/i);
  assert.match(migration, /requested_operation_id uuid/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /assert_actor_permission\(actor_profile_id,'sales\.edit'\)/i);
  assert.match(migration, /sales\.view_all/i);
  assert.match(migration, /sales\.view_own/i);
  assert.match(migration, /sale_row\.created_by\s*<>\s*actor_profile_id/i);
  assert.match(migration, /status\s*<>\s*'voided'/i);
  assert.match(migration, /credit period cannot be changed after invoice finalization/i);
  assert.match(migration, /explicit due date is required after invoice finalization/i);
  assert.match(migration, /correction reason is required after invoice finalization/i);
  assert.match(migration, /insert into public\.audit_logs/i);
  assert.match(migration, /old_values\s*,\s*new_values\s*,\s*metadata/i);
  assert.doesNotMatch(migration, /previous_values/i);
  assert.match(migration, /operation_id/i);
});

test("derived customer read models exclude drafts and use one stable invoice anchor", () => {
  for (const view of [
    "customer_receivables_v",
    "customer_receivables_detail_v",
    "customer_receivables_summary_v",
    "customer_receivables_metrics_v",
  ]) {
    assert.match(migration, new RegExp(`create or replace view public\\.${view}\\b`, "i"));
  }
  assert.match(migration, /sale\.status\s*not in\s*\('draft','cancelled'\)/i);
  assert.match(migration, /min\(timezone\('Asia\/Dhaka',document\.created_at\)::date\)/i);
  assert.match(migration, /document\.status\s*<>\s*'voided'/i);
  assert.match(migration, /coalesce\(sale\.payment_due_date,invoice\.anchor_date\+sale\.credit_period_days\)/i);
  assert.match(
    migration,
    /order by document\.order_id\s*,\s*document\.revision_number desc/i,
  );
  assert.match(migration, /greatest\(sale\.total_amount-sale\.paid_amount,0::numeric\)/i);
  assert.match(migration, /payment_status/i);
  assert.match(migration, /aging_bucket/i);
  assert.match(migration, /no_due_date/i);
  assert.match(migration, /90_plus_days_overdue/i);
  assert.match(migration, /due_next_7_days/i);
  assert.match(migration, /collected_this_month/i);
});

test("Phase 2 views remain service-only and financial posting systems are untouched", () => {
  for (const view of [
    "customer_receivables_v",
    "customer_receivables_detail_v",
    "customer_receivables_summary_v",
    "customer_receivables_metrics_v",
  ]) {
    assert.match(migration, new RegExp(`revoke all on public\\.${view} from public,anon,authenticated`, "i"));
    assert.match(migration, new RegExp(`grant select on public\\.${view} to service_role`, "i"));
  }
  assert.doesNotMatch(migration, /(?:insert into|update|delete from) public\.(?:sale_payments|journal_entries|journal_lines|cashbook_entries|hr_payroll_records|inventory_balances|inventory_movements)/i);
  assert.doesNotMatch(migration, /alter table public\.(?:receivable_accounts|receivable_transactions|receivable_external_parties)/i);
  assert.doesNotMatch(migration, /record_sale_payment/i);
});
