import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/202609200001_personal_quick_cashbook.sql", "utf8");
const accountingData = readFileSync("lib/accounting/data.ts", "utf8");
const accountingPage = readFileSync("app/admin/accounting/page.tsx", "utf8");
const auditData = readFileSync("lib/accounting/audit.ts", "utf8");
const auditList = readFileSync("app/admin/accounting/audit/page.tsx", "utf8");
const auditDetail = readFileSync("app/admin/accounting/audit/[date]/page.tsx", "utf8");
const auditActions = readFileSync("app/admin/accounting/audit/actions.ts", "utf8");
const auditReview = readFileSync("components/accounting/CashbookAuditReview.tsx", "utf8");

function between(startText: string, endText?: string) {
  const start = migration.indexOf(startText);
  assert.ok(start >= 0, `${startText} is missing`);
  const end = endText ? migration.indexOf(endText, start + startText.length) : migration.length;
  assert.ok(!endText || end >= 0, `${endText} is missing`);
  return migration.slice(start, end);
}

function functionBody(name: string, nextName?: string) {
  return between(`create function public.${name}`, nextName ? `create function public.${nextName}` : undefined);
}

test("deterministic legacy attribution requires one valid non-null creator", () => {
  const classification = between("with day_stats as (", "alter table public.cashbook_entries drop constraint");
  assert.match(classification, /count\(entry\.id\) as entry_count/i);
  assert.match(classification, /count\(distinct entry\.created_by\) as distinct_creator_count/i);
  assert.match(classification, /entry\.created_by is null or profile\.id is null/i);
  assert.match(classification, /join public\.profiles profile on profile\.id=entry\.created_by/i);
  assert.match(classification, /entry_count>0[\s\S]*invalid_creator_count=0[\s\S]*distinct_creator_count=1/i);
  assert.match(classification, /cashbook_scope='LEGACY_ATTRIBUTED'[\s\S]*cashbook_owner_id=proven\.cashbook_owner_id/i);
});

test("ambiguous legacy history remains global and data preserving", () => {
  const classification = between("update public.cashbook_days", "alter table public.cashbook_entries drop constraint");
  assert.match(classification, /cashbook_scope='LEGACY_GLOBAL',cashbook_owner_id=null/i);
  assert.match(classification, /update public\.cashbook_entries entry[\s\S]*cashbook_scope=day\.cashbook_scope[\s\S]*cashbook_owner_id=day\.cashbook_owner_id/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.cashbook_(?:days|entries)/i);
  assert.doesNotMatch(migration, /truncate\s+(?:table\s+)?public\.cashbook_(?:days|entries)/i);
});

test("legacy ownership is never guessed from arbitrary actors", () => {
  const classification = between("with day_stats as (", "alter table public.cashbook_entries drop constraint");
  assert.doesNotMatch(classification, /\b(?:min|max)\s*\(\s*(?:entry\.)?created_by/i);
  assert.doesNotMatch(classification, /closed_by|order\s+by[\s\S]*created_by|limit\s+1/i);
  assert.doesNotMatch(classification, /role\s*=\s*'admin'/i);
});

test("surrogate identity supports legacy and personal days on the same date", () => {
  assert.match(migration, /add column cashbook_day_id uuid/i);
  assert.match(migration, /primary key\(cashbook_day_id\)/i);
  assert.match(migration, /unique index cashbook_days_legacy_business_date_idx[\s\S]*\(business_date\)[\s\S]*cashbook_scope in \('LEGACY_GLOBAL','LEGACY_ATTRIBUTED'\)/i);
  assert.match(migration, /unique index cashbook_days_personal_owner_business_date_idx[\s\S]*\(cashbook_owner_id,business_date\)[\s\S]*cashbook_scope='PERSONAL'/i);
  assert.match(migration, /cashbook_entries_day_fkey[\s\S]*foreign key\(cashbook_day_id\)[\s\S]*cashbook_days\(cashbook_day_id\)/i);
});

test("employee A and B remain isolated by authenticated owner and PERSONAL scope", () => {
  assert.match(accountingPage, /cashbookOwnerId:\s*profile\.id/);
  assert.match(accountingData, /\.eq\("cashbook_scope", "PERSONAL"\)[\s\S]*\.eq\("cashbook_owner_id", cashbookOwnerId as string\)/);
  assert.doesNotMatch(accountingPage, /searchParams[\s\S]*cashbook_owner/i);
  assert.match(migration, /cashbook_scope in \('PERSONAL','LEGACY_ATTRIBUTED'\)[\s\S]*cashbook_owner_id=auth\.uid\(\)/i);
});

test("all new normal cashbook writes require PERSONAL owner", () => {
  assert.match(migration, /cashbook_days_scope_check[\s\S]*cashbook_scope in \('LEGACY_ATTRIBUTED','PERSONAL'\) and cashbook_owner_id is not null/i);
  for (const name of ["set_cashbook_opening_balance", "create_cashbook_entry", "close_cashbook_day"]) {
    const body = between(`create or replace function public.${name}`, name === "set_cashbook_opening_balance" ? "create or replace function public.create_cashbook_entry" : name === "create_cashbook_entry" ? "create or replace function public.close_cashbook_day" : "create or replace function public.record_sale_payment");
    assert.match(body, /cashbook_scope='PERSONAL'|'PERSONAL',actor_profile_id/i);
  }
});

test("first personal day requires explicit opening and never inherits legacy", () => {
  const opening = functionBody("cashbook_opening_balance_for", "lock_cashbook_timeline");
  assert.match(opening, /cashbook_scope='PERSONAL'/i);
  assert.doesNotMatch(opening, /LEGACY_GLOBAL|LEGACY_ATTRIBUTED/i);
  assert.doesNotMatch(opening, /coalesce/i);
  const createEntry = between("create or replace function public.create_cashbook_entry", "create or replace function public.close_cashbook_day");
  assert.match(createEntry, /if inherited_opening is null then raise exception 'Initialize the first personal cashbook opening balance/i);
});

test("later opening and predecessor use same-owner PERSONAL history only", () => {
  const opening = functionBody("cashbook_opening_balance_for", "lock_cashbook_timeline");
  const predecessor = functionBody("assert_cashbook_predecessor_closed");
  for (const body of [opening, predecessor]) {
    assert.match(body, /cashbook_scope='PERSONAL'/i);
    assert.match(body, /cashbook_owner_id=requested_cashbook_owner_id/i);
  }
  assert.match(predecessor, /business_date<requested_business_date/i);
});

test("Admin audit permission and workflow remain intact with day-id targeting", () => {
  assert.match(auditList, /requirePermission\("accounting\.audit_cashbook"\)/);
  assert.match(auditDetail, /requirePermission\("accounting\.audit_cashbook"\)/);
  assert.match(auditActions, /requirePermission\("accounting\.audit_cashbook"\)/g);
  assert.match(auditActions, /requested_cashbook_day_id:\s*cashbookDayId/g);
  assert.match(auditReview, /name="cashbook_day_id"/g);
  assert.match(migration, /audit_status='APPROVED'/i);
  assert.match(migration, /audit_status='CORRECTION_REQUIRED'/i);
});

test("legacy-global history is auditor-only", () => {
  const policies = between('drop policy if exists "cashbook days read"', "drop function public.cashbook_opening_balance_for");
  assert.match(policies, /cashbook_scope in \('PERSONAL','LEGACY_ATTRIBUTED'\)[\s\S]*cashbook_owner_id=auth\.uid\(\)/i);
  assert.match(policies, /current_user_has_permission\('accounting\.audit_cashbook'\)/i);
  assert.doesNotMatch(policies, /cashbook_scope='LEGACY_GLOBAL'[\s\S]*auth\.uid/i);
});

test("Sales posting remains owner-scoped without Sales source changes", () => {
  const body = between("create or replace function public.record_sale_payment", "drop function public.approve_cashbook_audit");
  assert.match(body, /assert_actor_permission\(actor_profile_id,'sales\.record_payment'\)/i);
  assert.match(body, /cashbook_scope='PERSONAL'[\s\S]*cashbook_owner_id=actor_profile_id/i);
  assert.match(body, /cashbook_id,day_row\.cashbook_day_id,'PERSONAL',actor_profile_id/i);
  assert.match(body, /received_by,operation_id,receipt_channel[\s\S]*actor_profile_id/i);
});

test("audit list and detail preserve all legacy scopes by cashbook_day_id", () => {
  assert.match(auditData, /cashbook_day_id/);
  assert.match(auditData, /Legacy Global Cashbook/);
  assert.match(auditData, /totals\.get\(day\.cashbook_day_id\)/);
  assert.match(auditData, /getAccountingDashboard\(date, \{ includeLedger: false, cashbookDayId \}\)/);
  assert.match(auditList, /key=\{day\.cashbookDayId\}/);
  assert.match(auditDetail, /getCashbookAuditDay\(cashbookDayId, date\)/);
});

test("migration validates fail-closed before commit", () => {
  assert.match(migration, /^\s*--[\s\S]*?\bbegin;/i);
  assert.match(migration, /lock table public\.cashbook_entries, public\.cashbook_days in access exclusive mode/i);
  assert.match(migration, /Expected legacy cashbook identity columns are missing/i);
  assert.match(migration, /Legacy cashbook entries contain an orphan business date/i);
  assert.match(migration, /Cashbook day scope\/owner validation failed/i);
  assert.match(migration, /Cashbook entry\/day validation failed/i);
  assert.match(migration, /Cashbook owner validation failed/i);
  assert.match(migration, /commit;\s*$/i);
});

test("native schema builder includes the revised migration last", () => {
  const builder = readFileSync("scripts/build-native-schema.mjs", "utf8");
  const nativeSchema = readFileSync("database/native/schema.sql", "utf8");
  assert.match(builder, /202609200001_personal_quick_cashbook\.sql/);
  assert.ok(builder.lastIndexOf("personalQuickCashbookMigration.trim()") > builder.lastIndexOf("murshidaManzilSnapshotsMigration.trim()"));
  assert.match(nativeSchema, /data-preserving legacy history/i);
  assert.match(nativeSchema, /cashbook_days_personal_owner_business_date_idx/i);
});
