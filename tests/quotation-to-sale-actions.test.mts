import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("staff quotation creation begins in draft instead of manufacturing an issued quote", () => {
  const actions = source("app/admin/quotations/actions.ts");

  assert.match(actions, /status:\s*"draft"/);
});

test("generic quotation update cannot manufacture customer outcomes or conversions", () => {
  const actions = source("app/admin/quotations/actions.ts");

  assert.match(actions, /isQuotationImmutable/);
  assert.doesNotMatch(actions, /"accepted"|"declined"|"converted_to_sale"/);
});

test("dedicated outcome actions authorize a scoped quotation before the transition RPC", () => {
  const actions = source("app/admin/quotations/workflow-actions.ts");

  for (const action of [
    "approveQuotationAction",
    "rejectQuotationAction",
    "issueQuotationAction",
    "acceptQuotationAction",
    "declineQuotationAction",
  ]) {
    assert.match(actions, new RegExp(`export async function ${action}`));
  }
  assert.match(actions, /quotationForUpdate\(/);
  assert.match(actions, /transition_quotation_business_status/);
  assert.match(actions, /requested_transition/);
});

test("customer decline requires a trimmed reason within the database contract boundary", () => {
  const actions = source("app/admin/quotations/workflow-actions.ts");

  assert.match(actions, /reason\.length < 1 \|\| reason\.length > 2000/);
  assert.match(actions, /"decline"/);
});
