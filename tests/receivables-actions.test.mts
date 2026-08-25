import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actions = await readFile(
  new URL("../app/admin/receivables/actions.ts", import.meta.url),
  "utf8",
).catch(() => "");
const forms = await readFile(
  new URL("../components/receivables/ReceivableAccountForms.tsx", import.meta.url),
  "utf8",
).catch(() => "");

test("server actions reauthorize, validate, and call only the approved RPCs", () => {
  assert.match(actions, /^\s*["']use server["']/);
  assert.match(actions, /export async function createRequestedReceivableAction/);
  assert.match(actions, /export async function createOpeningReceivableAction/);
  assert.match(
    actions,
    /createRequestedReceivableAction[\s\S]*requirePermission\("receivables\.create"\)/,
  );
  assert.match(
    actions,
    /createOpeningReceivableAction[\s\S]*requirePermission\("receivables\.manage_opening"\)/,
  );
  assert.match(actions, /normalizeRequestedReceivableInput/);
  assert.match(actions, /normalizeOpeningReceivableInput/);
  assert.match(actions, /\.rpc\("create_receivable_account"/);
  assert.match(actions, /\.rpc\("create_opening_receivable"/);
  assert.match(actions, /actor_profile_id:\s*profile\.id/);
  assert.match(actions, /revalidatePath\("\/admin\/receivables"\)/);
  assert.doesNotMatch(actions, /\.from\(["'](?:journal_entries|cashbook_entries|sale_payments|hr_payroll_records)["']\)/);
  assert.doesNotMatch(actions, /\.from\(["']receivable_(?:accounts|transactions)["']\)\.(?:insert|update|upsert|delete)/);
});

test("forms use accessible labels, stable operation IDs, and pending feedback", () => {
  assert.match(forms, /^\s*["']use client["']/);
  assert.match(forms, /useActionState/);
  assert.match(forms, /name=["']operation_id["']/);
  assert.match(forms, /name=["']borrower_type["']/);
  assert.match(forms, /name=["']original_amount["']/);
  assert.match(forms, /Opening \/ Existing Receivable/);
  assert.match(forms, /name=["']previously_repaid_amount["']/);
  assert.match(forms, /name=["']opening_outstanding_amount["']/);
  assert.match(forms, /aria-live=["']polite["']/);
  assert.match(forms, /pending/);
  assert.doesNotMatch(forms, /name=["'](?:journal|cashbook|payroll|accounting)[^"']*["']/i);
  assert.doesNotMatch(forms, /action=.*(?:journal|cashbook|payroll|accounting)/i);
});
