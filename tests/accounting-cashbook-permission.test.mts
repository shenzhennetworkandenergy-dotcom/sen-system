import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("cashbook-only permission exposes the Accounting navigation item", async () => {
  const navigation = await readFile("lib/navigation/dashboard.ts", "utf8");
  assert.match(navigation, /alternativePermissions:\["accounting\.manage_cashbook"\]/);
  assert.match(navigation, /alternativePermissions\?\.some/);
});

test("cashbook-only access does not expose general-ledger controls", async () => {
  const page = await readFile("app/admin/accounting/page.tsx", "utf8");
  assert.match(page, /includeLedger: canViewLedger/);
  assert.match(page, /canViewLedger \? <>/);
  assert.match(page, /canCreateJournal \? <JournalForm/);
  assert.match(page, /canManageCashbook/);
});

test("cashbook actions accept the dedicated permission without changing journal actions", async () => {
  const actions = await readFile("app/admin/accounting/actions.ts", "utf8");
  assert.match(actions, /accounting\.manage_cashbook/);
  assert.match(actions, /createJournalAction[\s\S]*requirePermission\("accounting\.create_entry"\)/);
});

test("only admins can see or call cashbook description creation", async () => {
  const page = await readFile("app/admin/accounting/page.tsx", "utf8");
  const component = await readFile("components/accounting/QuickCashbook.tsx", "utf8");
  const actions = await readFile("app/admin/accounting/actions.ts", "utf8");
  const descriptionAction = actions.slice(
    actions.indexOf("export async function createCashbookDescriptionAction"),
    actions.indexOf("export async function createCashbookEntryAction"),
  );

  assert.match(page, /canCreateDescription=\{profile\.role === "admin"\}/);
  assert.match(component, /\{canCreateDescription \? <>/);
  assert.match(descriptionAction, /requireProfile\(\["admin"\]\)/);
  assert.doesNotMatch(descriptionAction, /requireAnyPermission/);
});

test("only admins can create dynamic cashbook transaction types", async () => {
  const actions = await readFile("app/admin/accounting/actions.ts", "utf8");
  const transactionTypeAction = actions.slice(
    actions.indexOf("export async function createCashbookTransactionTypeAction"),
    actions.indexOf("export async function setCashbookOpeningBalanceAction"),
  );

  assert.match(transactionTypeAction, /requireProfile\(\["admin"\]\)/);
  assert.doesNotMatch(transactionTypeAction, /requireAnyPermission/);
});
