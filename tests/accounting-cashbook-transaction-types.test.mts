import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Quick Cashbook renders admin transaction type creation and dynamic dropdowns", async () => {
  const component = await readFile("components/accounting/QuickCashbook.tsx", "utf8");

  assert.match(component, /\+ Create Transaction Type/);
  assert.match(component, /Transaction Type Name \(English\)/);
  assert.match(component, /Transaction Type Name \(Bangla\)/);
  assert.match(component, /Save Transaction Type/);
  assert.match(component, /availableTransactionTypes\.map/);
  assert.match(component, /setAvailableTransactionTypes/);
  assert.doesNotMatch(component, /const typeLabels/);
});

test("cashbook transaction type migration is additive and preserves accounting effects", async () => {
  const migration = await readFile(
    "supabase/migrations/202608210001_cashbook_transaction_types.sql",
    "utf8",
  );

  assert.match(migration, /create table if not exists public\.cashbook_transaction_types/);
  assert.match(migration, /balance_effect text not null check \(balance_effect in \('income','expense'\)\)/);
  assert.match(migration, /add column if not exists transaction_type_id uuid/);
  assert.match(migration, /create_cashbook_transaction_type/);
  assert.match(migration, /create_cashbook_description_with_type/);
  assert.doesNotMatch(migration, /truncate\s|drop table|delete from/i);
});
