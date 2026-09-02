import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import test from "node:test";

const migrationDir = "supabase/migrations";
const migrationName = "202609010001_accounting_cashbook_audit.sql";
const migrationPath = `${migrationDir}/${migrationName}`;

function read(path: string) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

test("Cashbook Audit migration exists and defines the four-state audit model", () => {
  assert.equal(existsSync(migrationPath), true, `missing ${migrationPath}`);
  const migration = read(migrationPath);
  assert.match(migration, /alter\s+table\s+public\.cashbook_days/i);
  assert.match(migration, /audit_status\s+text/i);
  for (const field of ["reviewed_at", "reviewed_by", "review_comment", "correction_reason", "correction_requested_at", "correction_requested_by"]) {
    assert.match(migration, new RegExp(`\\b${field}\\b`, "i"));
  }
  assert.match(migration, /open|pending_audit|approved|correction_required/i);
  assert.match(migration, /audit_status[\s\S]*(open|pending_audit)[\s\S]*approved[\s\S]*correction_required/i);
});

test("legacy closed cashbook days are backfilled as pending audit", () => {
  const migration = read(migrationPath);
  const backfill = migration.slice(migration.indexOf("update public.cashbook_days"), migration.indexOf("insert into public.permissions"));
  assert.match(backfill, /update\s+public\.cashbook_days/i);
  assert.match(backfill, /where\s+[\s\S]*?is_closed\s*=\s*true/i);
  assert.match(backfill, /pending_audit/i);
  assert.doesNotMatch(backfill, /set[^;]*audit_status\s*=\s*'approved'[^;]*where[^;]*is_closed/i);
});

test("audit RPCs require the cashbook permission and enforce state-specific guards", () => {
  const migration = read(migrationPath);
  assert.match(migration, /create\s+or\s+replace\s+function\s+public\.approve_cashbook_audit/i);
  assert.match(migration, /create\s+or\s+replace\s+function\s+public\.request_cashbook_correction/i);
  assert.match(migration, /assert_actor_permission\s*\([\s\S]*?accounting\.audit_cashbook/i);
  assert.match(migration, /only[\s\S]*?pending_audit[\s\S]*?approv/i);
  assert.match(migration, /only[\s\S]*?pending_audit[\s\S]*?(correction|correct)/i);
  assert.match(migration, /for\s+update/i);
  assert.match(migration, /audit_status\s*=\s*'pending_audit'/i);
  assert.match(migration, /is_closed\s*=\s*true/i);
});

test("correction requests and approvals require a non-empty reason", () => {
  const migration = read(migrationPath);
  assert.match(migration, /requested_reason|correction_reason/i);
  assert.match(migration, /nullif\s*\(\s*trim\s*\(/i);
  assert.match(migration, /char_length\s*\([\s\S]*?reason/i);
  assert.match(migration, /reason[^;]*(required|must not be empty|at least)/i);
});

test("Cashbook Audit route and actions expose permission-protected review workflow", () => {
  const page = read("app/admin/accounting/audit/page.tsx");
  const detail = read("app/admin/accounting/audit/[date]/page.tsx");
  const actions = read("app/admin/accounting/audit/actions.ts");
  assert.match(page, /requirePermission\("accounting\.audit_cashbook"\)/);
  assert.match(page, /getCashbookAuditDays|cashbook/i);
  assert.match(page, /approve|correction/i);
  assert.match(detail, /requirePermission\("accounting\.audit_cashbook"\)/);
  assert.match(detail, /QuickCashbook|statement/i);
  assert.match(read("components/accounting/CashbookAuditReview.tsx"), /Current Audit Status/i);
  assert.match(actions, /approve_cashbook_audit/i);
  assert.match(actions, /request_cashbook_correction/i);
  assert.match(actions, /accounting\.audit_cashbook/i);
  assert.match(actions, /reason/i);
});

test("Accounting navigation links the audit page and renders all status labels", async () => {
  const navigation = read("lib/navigation/dashboard.ts");
  const routes = read("lib/constants/routes.ts");
  assert.match(routes, /adminAccountingAudit:\s*"\/admin\/accounting\/audit"/);
  assert.match(navigation, /adminAccountingAudit|accounting\/audit/);
  const files = await readdir("app/admin/accounting/audit");
  assert.ok(files.includes("page.tsx"));
  const page = read("app/admin/accounting/audit/page.tsx");
  const auditData = read("lib/accounting/audit.ts");
  for (const label of ["Open", "Pending Audit", "Approved", "Correction Required"]) {
    assert.match(`${page}\n${auditData}`, new RegExp(label, "i"));
  }
});

test("Cashbook status messaging is scoped to audit outcomes and correction reason", async () => {
  const component = read("components/accounting/QuickCashbook.tsx");
  assert.match(component, /Cashbook closed and waiting for Admin audit/i);
  assert.match(component, /Admin requested correction/i);
  assert.match(component, /Cashbook audited and approved/i);
  assert.match(component, /correctionReason|reviewComment/i);
  assert.doesNotMatch(component, /reopen_cashbook_day|unlock/i);
});

test("audit data exposes the closed statement fields without mutation controls", () => {
  const data = read("lib/accounting/audit.ts");
  assert.match(data, /cashbook_days/i);
  assert.match(data, /opening_balance/i);
  assert.match(data, /closing_balance/i);
  assert.match(data, /closed_by/i);
  assert.match(data, /closed_at/i);
  assert.match(data, /audit_status/i);
  assert.match(data, /cashbook_entries/i);
});

test("closing keeps the existing cashbook lock, balance calculation, and close event", () => {
  const migration = read(migrationPath);
  const closeStart = migration.indexOf("create or replace function public.close_cashbook_day");
  const closeBody = migration.slice(closeStart);
  assert.match(closeBody, /lock_cashbook_timeline/i);
  assert.match(closeBody, /assert_cashbook_predecessor_closed/i);
  assert.match(closeBody, /sum\(amount\)[\s\S]*?income/i);
  assert.match(closeBody, /is_closed\s*=\s*true/i);
  assert.match(closeBody, /closing_balance\s*=\s*final_balance/i);
  assert.match(closeBody, /closed_at\s*=\s*now\(\)/i);
  assert.match(closeBody, /closed_by\s*=\s*actor_profile_id/i);
  assert.match(closeBody, /accounting\.cashbook_day_closed/i);
  assert.match(closeBody, /audit_status\s*=\s*'PENDING_AUDIT'/i);
});

test("audit UI has no reopen or financial mutation path", () => {
  const detail = read("app/admin/accounting/audit/[date]/page.tsx");
  const component = read("components/accounting/CashbookAuditReview.tsx");
  const actions = read("app/admin/accounting/audit/actions.ts");
  assert.doesNotMatch(`${detail}\n${component}\n${actions}`, /reopen_cashbook_day|reverse|delete.*cashbook|create_cashbook_entry/i);
});

test("native schema generation includes the additive audit migration", () => {
  const builder = read("scripts/build-native-schema.mjs");
  const schema = read("database/native/schema.sql");
  assert.match(builder, /202609010001_accounting_cashbook_audit\.sql/);
  assert.match(schema, /approve_cashbook_audit/i);
  assert.match(schema, /request_cashbook_correction/i);
});

test("native Supabase import normalizes legacy cashbook rows and permission after dump restore", () => {
  const importer = read("scripts/windows/Migrate-FromSupabase.ps1");
  const dumpImportIndex = importer.indexOf("-f $dump");
  assert.ok(dumpImportIndex >= 0, "the data dump import command is missing");
  const postImport = importer.slice(dumpImportIndex);
  const compatibilityIndex = postImport.search(/update\s+public\.cashbook_days/i);
  assert.ok(compatibilityIndex >= 0, "post-import audit compatibility SQL is missing");
  const compatibilityEnd = postImport.indexOf("migrate-supabase-storage.mjs", compatibilityIndex);
  assert.ok(compatibilityEnd > compatibilityIndex, "post-import compatibility step must precede storage migration");
  const compatibility = postImport.slice(compatibilityIndex, compatibilityEnd);

  assert.match(compatibility, /update\s+public\.cashbook_days/i);
  assert.match(compatibility, /set\s+audit_status\s*=\s*'PENDING_AUDIT'/i);
  assert.match(compatibility, /where[\s\S]*is_closed\s*=\s*true[\s\S]*audit_status[\s\S]*(?:is\s+null|=\s*'OPEN')/i);
  assert.match(compatibility, /insert\s+into\s+public\.permissions/i);
  assert.match(compatibility, /accounting\.audit_cashbook/i);
  assert.match(compatibility, /on\s+conflict\s*\(\s*key\s*\)\s+do\s+update/i);
  assert.doesNotMatch(compatibility, /profile_permission_(?:templates|overrides)/i);

  const permissionIndex = compatibility.search(/insert\s+into\s+public\.permissions/i);
  assert.ok(permissionIndex > 0, "permission upsert must follow the status backfill");
  assert.doesNotMatch(compatibility.slice(0, permissionIndex), /closing_balance|opening_balance|closed_at|closed_by|cashbook_entries|journal|sale_payments/i);
});
