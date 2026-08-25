import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [actions, detailPage, paymentAccounting] = await Promise.all([
  readFile(new URL("../app/admin/sales/actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/admin/sales/[saleId]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/sales/payment-accounting.ts", import.meta.url), "utf8"),
]);

test("commercial terms action reauthorizes Sales edit and ownership before one audited RPC", () => {
  assert.match(actions, /export async function updateSaleCommercialTermsAction/);
  assert.match(
    actions,
    /updateSaleCommercialTermsAction[\s\S]*requirePermission\(["']sales\.edit["']\)/,
  );
  assert.match(actions, /resolveSalesVisibilityScope/);
  assert.match(actions, /canAccessSaleUnderScope/);
  assert.match(actions, /normalizeCommercialTermsDraft/);
  assert.match(actions, /normalizeDueDateCorrectionDraft/);
  assert.match(actions, /\.rpc\(["']update_sale_commercial_terms["']/);
  assert.match(actions, /requested_operation_id/);
  assert.match(actions, /revalidatePath\(["']\/admin\/receivables["']\)/);
  assert.match(actions, /revalidatePath\(["']\/admin\/receivables\/customers["']\)/);
});

test("Sale detail exposes structured terms before invoice and reasoned due-date correction after invoice", () => {
  assert.match(detailPage, /Commercial payment terms/);
  assert.match(detailPage, /name=["']payment_terms_type["']/);
  assert.match(detailPage, /name=["']credit_period_preset["']/);
  assert.match(detailPage, /name=["']custom_credit_period_days["']/);
  assert.match(detailPage, /name=["']payment_due_date["']/);
  assert.match(detailPage, /name=["']reason["']/);
  assert.match(detailPage, /updateSaleCommercialTermsAction/);
  assert.match(detailPage, /hasNonVoidInvoice/);
  assert.match(detailPage, /Invoice finalized/);
  assert.match(detailPage, /Earliest valid invoice/);
});

test("Phase 2 leaves the authoritative Sales payment builder and posting route intact", () => {
  assert.match(actions, /recordPaymentAction[\s\S]*\.rpc\(["']record_sale_payment["']/);
  assert.match(paymentAccounting, /buildSalePaymentRpcArguments/);
  assert.match(paymentAccounting, /requested_operation_id/);
  assert.match(paymentAccounting, /requested_receipt_channel/);
  assert.doesNotMatch(actions, /\.from\(["'](?:journal_entries|cashbook_entries)["']\)\.(?:insert|update|upsert|delete)/);
});
