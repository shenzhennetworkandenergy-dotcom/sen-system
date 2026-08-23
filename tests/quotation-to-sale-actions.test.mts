import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveQuotationViewScope } from "../lib/quotations/access-policy.ts";
import { canTransitionQuotation } from "../lib/quotations/workflow.ts";

const source = (path: string) => readFileSync(path, "utf8");
const actionSource = (name: string) => {
  const actions = source("app/admin/quotations/workflow-actions.ts");
  const start = actions.indexOf(`export async function ${name}`);
  const end = actions.indexOf("export async function", start + 1);
  return actions.slice(start, end === -1 ? undefined : end);
};

test("staff quotation creation begins in draft instead of manufacturing an issued quote", () => {
  const actions = source("app/admin/quotations/actions.ts");

  assert.match(actions, /status:\s*"draft"/);
});

test("generic quotation update cannot manufacture customer outcomes or conversions", () => {
  const actions = source("app/admin/quotations/actions.ts");

  assert.match(actions, /isQuotationImmutable/);
  assert.doesNotMatch(actions, /"accepted"|"declined"|"converted_to_sale"/);
});

test("quotation mutation scope never broadens a mutation-only employee", () => {
  const cases = [
    { role: "admin", permissions: [], expected: "all" },
    { role: "employee", permissions: ["quotations.view"], expected: "all" },
    { role: "employee", permissions: ["quotations.view_all"], expected: "all" },
    { role: "employee", permissions: ["quotations.view_own"], expected: "own" },
    { role: "employee", permissions: ["quotations.edit"], expected: null },
    {
      role: "employee",
      permissions: ["quotations.approve", "quotations.assign"],
      expected: null,
    },
  ] as const;

  for (const { role, permissions, expected } of cases) {
    assert.equal(resolveQuotationViewScope(role, new Set(permissions)), expected);
  }
});

test("quotation action boundary rejects a missing view scope before querying with service credentials", () => {
  const actions = source("app/admin/quotations/workflow-actions.ts");

  assert.match(actions, /resolveQuotationViewScope/);
  assert.match(
    actions,
    /const scope = resolveQuotationViewScope\(profile\.role, permissions\);\s*if \(!scope\) fail\([^)]*Quotation access denied\./,
  );
  assert.match(
    actions,
    /if \(scope === "own"\) \{\s*query = query\.eq\("created_by", profile\.id\);\s*\}/,
  );
});

test("generic quotation action also rejects a missing view scope before lookup", () => {
  const actions = source("app/admin/quotations/actions.ts");

  assert.match(actions, /resolveQuotationViewScope/);
  assert.match(
    actions,
    /const scope = resolveQuotationViewScope\(profile\.role, permissions\);\s*if \(!scope\) \{\s*redirect\([^)]*Quotation%20access%20denied/,
  );
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
  assert.match(
    actions,
    /requirePermission\(permission\)[\s\S]*quotationForUpdate\([\s\S]*db\.rpc\("transition_quotation_business_status"/,
  );

  for (const [action, permission, transition] of [
    ["approveQuotationAction", "quotations.approve", "approve"],
    ["rejectQuotationAction", "quotations.reject", "reject"],
    ["issueQuotationAction", "quotations.send", "issue"],
    [
      "acceptQuotationAction",
      "quotations.record_customer_outcome",
      "accept",
    ],
    [
      "declineQuotationAction",
      "quotations.record_customer_outcome",
      "decline",
    ],
  ] as const) {
    const body = actionSource(action);
    assert.match(body, new RegExp(`"${permission}"\\s*,\\s*"${transition}"`));
  }
});

test("customer decline requires a trimmed reason within the database contract boundary", () => {
  const actions = source("app/admin/quotations/workflow-actions.ts");

  assert.match(
    actions,
    /form\.get\(transition === "decline" \? "reason" : "note"\)[\s\S]*\.trim\(\)/,
  );
  assert.match(actions, /reason\.length < 1 \|\| reason\.length > 2000/);
  assert.match(actions, /"decline"/);
});

test("non-terminal quotation mutations compare the read status and require the guarded write result", () => {
  for (const action of [
    "updateQuotationDetailsAction",
    "assignQuotationAction",
    "requestQuotationInformationAction",
  ]) {
    const body = actionSource(action);
    assert.match(body, /\.eq\("status", quotation\.status\)/);
    assert.match(body, /\.select\("id"\)\.maybeSingle\(\)/);
    assert.match(body, /if \(error \|\| !data\)/);
  }
});

test("expired quotations cannot expose customer acceptance while current issued quotations can", () => {
  const cases = [
    { expirationDate: "2026-08-22", today: "2026-08-23", expected: false },
    { expirationDate: "2026-08-23", today: "2026-08-23", expected: true },
    { expirationDate: null, today: "2026-08-23", expected: true },
  ] as const;

  for (const { expirationDate, today, expected } of cases) {
    assert.equal(
      canTransitionQuotation("quoted", "accept", expirationDate, today),
      expected,
    );
  }
});

test("the application no longer exposes the legacy invoice conversion action or RPC", () => {
  const actions = source("app/admin/quotations/workflow-actions.ts");
  const operations = source("components/quotations/QuotationOperations.tsx");

  assert.doesNotMatch(actions, /convertQuotationToInvoiceAction/);
  assert.doesNotMatch(actions, /convert_quotation_to_invoice/);
  assert.doesNotMatch(operations, /convertQuotationToInvoiceAction/);
});
