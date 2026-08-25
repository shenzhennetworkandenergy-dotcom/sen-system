import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Receivables database verifier is local-only, rollback-only, and covers financial isolation", async () => {
  const verifier = await readFile("scripts/verify-receivables-database.mjs", "utf8");

  assert.match(verifier, /localhost|127\.0\.0\.1|::1/);
  assert.match(verifier, /begin/i);
  assert.match(verifier, /rollback/i);
  assert.match(verifier, /receivables\.manage_opening/);
  assert.match(verifier, /receivables\.create/);
  assert.match(verifier, /immutable/i);
  assert.match(verifier, /sale_payments/);
  assert.match(verifier, /journal_entries/);
  assert.match(verifier, /cashbook_entries/);
  assert.match(verifier, /hr_payroll_records/);
  assert.match(verifier, /same operation/i);
  assert.match(verifier, /customer_receivables_detail_v/);
  assert.match(verifier, /customer_receivables_summary_v/);
  assert.match(verifier, /customer_receivables_metrics_v/);
  assert.match(verifier, /update_sale_commercial_terms/);
  assert.match(verifier, /payment_terms_type/);
  assert.match(verifier, /sales\.view_own/);
  assert.match(verifier, /draft/i);
  assert.match(verifier, /Asia\/Dhaka/);
});
