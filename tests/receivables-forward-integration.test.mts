import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native generation keeps deployed quotation migration before Phase 3 receivables", async () => {
  const schema = (await readFile("database/native/schema.sql", "utf8")).replaceAll(
    "\r\n",
    "\n",
  );
  const quotationPosition = schema.indexOf(
    "create or replace function public.update_draft_quotation(",
  );
  const phase3Position = schema.indexOf(
    "create or replace function public.confirm_receivable_disbursement(",
  );
  const nativeGrantsPosition = schema.indexOf(
    "-- Native application service access. Browser users never receive this role.",
  );

  assert.ok(quotationPosition >= 0, "deployed Draft quotation editing must remain present");
  assert.ok(
    phase3Position > quotationPosition,
    "Phase 3 Receivables must follow the deployed quotation migration",
  );
  assert.ok(
    phase3Position < nativeGrantsPosition,
    "Phase 3 Receivables must be applied before native service grants",
  );
});
