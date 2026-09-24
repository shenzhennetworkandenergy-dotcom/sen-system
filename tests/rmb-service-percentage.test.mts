import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { calculateRmbEstimate } from "../lib/rmb-payments/calculations.ts";

const migrationPath = "supabase/migrations/202609170001_rmb_customer_service_percentage.sql";

test("RMB estimates preserve the existing no-percentage calculation", () => {
  assert.deepEqual(calculateRmbEstimate(100, 20, null), {
    baseAmount: 100,
    serviceAmount: 0,
    adjustedAmount: 100,
    payable: 2000,
  });
});

test("RMB estimates apply 4% and 13% without intermediate rounding", () => {
  assert.deepEqual(calculateRmbEstimate(100, 20, 4), {
    baseAmount: 100,
    serviceAmount: 4,
    adjustedAmount: 104,
    payable: 2080,
  });
  assert.deepEqual(calculateRmbEstimate(100, 20, 13), {
    baseAmount: 100,
    serviceAmount: 13,
    adjustedAmount: 113,
    payable: 2260,
  });
  assert.equal(calculateRmbEstimate(10.1234, 17.123456, 5.5).serviceAmount, 10.1234 * 5.5 / 100);
});

test("migration keeps preferences RMB-owned and preserves immutable snapshots", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table public\.rmb_customer_preferences/);
  assert.match(sql, /customer_id uuid primary key references public\.profiles\(id\)/);
  assert.match(sql, /add column extra_service_applied boolean not null default false/);
  assert.match(sql, /add column service_percentage numeric\(7,4\)/);
  assert.match(sql, /add column service_amount numeric/);
  assert.match(sql, /add column adjusted_rmb_amount numeric/);
  assert.match(sql, /new\.service_amount := new\.foreign_amount \* new\.service_percentage \/ 100/);
  assert.match(sql, /round\(new\.adjusted_rmb_amount \* new\.agreed_bdt_rate, 2\)/);
  assert.match(sql, /RMB customer request financial snapshot is immutable/);
  assert.doesNotMatch(sql, /drop table|drop column|truncate/i);
  assert.doesNotMatch(sql, /update public\.rmb_payment_jobs\s+set service_amount/i);
});

test("customer requests resolve the preference internally and cannot submit a percentage", async () => {
  const [sql, customerAction, customerForm] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile("app/account/rmb-payments/actions.ts", "utf8"),
    readFile("app/account/rmb-payments/new/RmbCustomerRequestForm.tsx", "utf8"),
  ]);
  assert.match(sql, /from public\.rmb_customer_preferences as preference/);
  assert.match(sql, /where preference\.customer_id = new\.customer_id/);
  assert.doesNotMatch(customerAction, /service_percentage|extra_service_applied/);
  assert.doesNotMatch(customerForm, /service_percentage|extra service|customer default/i);
});

test("customer detail uses an explicit projection without internal financial fields", async () => {
  const data = await readFile("lib/rmb-payments/data.ts", "utf8");
  const customerDetail = data.slice(
    data.indexOf("export async function getRmbCustomerJob("),
    data.indexOf("export async function getRmbCustomerProofPath("),
  );
  assert.doesNotMatch(customerDetail, /\.select\("\*"\)/);
  assert.doesNotMatch(customerDetail, /service_percentage|service_amount|adjusted_rmb_amount|extra_service_applied/);
});

test("admin defaults remain independent from transaction overrides", async () => {
  const [form, action] = await Promise.all([
    readFile("app/admin/rmb-payments/new/RmbPaymentForm.tsx", "utf8"),
    readFile("app/admin/rmb-payments/actions.ts", "utf8"),
  ]);
  assert.match(form, /Customer default:/);
  assert.match(form, /Save as Customer Default/);
  assert.match(form, /Update Customer Default/);
  assert.match(form, /Remove Customer Default/);
  assert.match(form, /Saving or removing the default does not change this transaction/);
  assert.match(action, /operation === "remove"/);
  assert.match(action, /rmb_customer_preferences/);
  assert.match(action, /requested_extra_service_applied: values\.extra_service_applied/);
  assert.match(action, /requested_service_percentage: percentage/);
});

test("invalid service percentages are rejected by server and database validation", async () => {
  const [sql, action] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile("app/admin/rmb-payments/actions.ts", "utf8"),
  ]);
  assert.match(action, /percentage <= 0 \|\| percentage > 100/);
  assert.match(action, /Number\.isFinite\(percentage\)/);
  assert.match(sql, /requested_service_percentage <> round\(requested_service_percentage, 4\)/);
  assert.match(sql, /requested_service_percentage = 'NaN'::numeric/);
});
