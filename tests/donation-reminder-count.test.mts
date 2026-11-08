import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { countDueDonationSupports } from "../lib/donation-expenses/reminder-count.ts";

const now = new Date("2026-11-08T12:00:00Z");
const beneficiary = (id: string, overrides = {}) => ({
  id, is_active: true, monthly_support_enabled: true, reminder_day_of_month: 1,
  support_start_date: "2026-01-01", support_end_date: null, ...overrides,
});
const reminder = (id: string, overrides = {}) => ({
  beneficiary_id: id, support_month: "2026-11-01", reminder_day_of_month: 1,
  status: "PENDING", ...overrides,
});

test("two existing overdue supports produce the requested badge count", () => {
  assert.equal(countDueDonationSupports([reminder("a"), reminder("b")], [beneficiary("a"), beneficiary("b")], now), 2);
});
test("due today is included while upcoming supports are excluded", () => {
  assert.equal(countDueDonationSupports([reminder("a", { reminder_day_of_month: 8 }), reminder("b", { reminder_day_of_month: 9 })], [], now), 1);
});
test("completed and skipped rows suppress their virtual reminders", () => {
  assert.equal(countDueDonationSupports([reminder("a", { status: "COMPLETED" }), reminder("b", { status: "SKIPPED" })], [beneficiary("a"), beneficiary("b")], now), 0);
});
test("month rollover shows due supports before opening the module without creating rows", () => {
  const scheduled = [beneficiary("a"), beneficiary("b")];
  const before = structuredClone(scheduled);
  assert.equal(countDueDonationSupports([reminder("a", { status: "COMPLETED", support_month: "2026-10-01" })], scheduled, new Date("2026-11-01T00:00:00Z")), 2);
  assert.deepEqual(scheduled, before);
});
test("virtual and materialized reminders count once and preserve stored dates", () => {
  assert.equal(countDueDonationSupports([reminder("a", { reminder_day_of_month: 20 })], [beneficiary("a"), beneficiary("b")], now), 1);
  assert.equal(countDueDonationSupports([reminder("a"), reminder("a")], [beneficiary("a")], now), 1);
});
test("inactive disabled future and expired schedules are excluded", () => {
  assert.equal(countDueDonationSupports([], [
    beneficiary("a", { is_active: false }), beneficiary("b", { monthly_support_enabled: false }),
    beneficiary("c", { support_start_date: "2026-12-01" }), beneficiary("d", { support_end_date: "2026-10-31" }),
    beneficiary("e", { support_start_date: null }),
  ], now), 0);
});
test("eligibility uses existing SQL month rules rather than changing support policy", () => {
  assert.equal(countDueDonationSupports([], [beneficiary("a", { support_start_date: "2026-11-20" }), beneficiary("b", { support_end_date: "2026-11-01" })], now), 2);
});
test("persisted pending reminders stay visible after settings change", () => {
  assert.equal(countDueDonationSupports([reminder("a")], [beneficiary("a", { is_active: false, monthly_support_enabled: false })], now), 1);
});
test("previous month pending reminders and invalid reminder days are not counted", () => {
  assert.equal(countDueDonationSupports([reminder("a", { support_month: "2026-10-01" })], [], now), 0);
  for (const day of [null, 0, 29, 1.5, NaN]) {
    assert.equal(countDueDonationSupports([], [beneficiary("a", { reminder_day_of_month: day })], now), 0);
  }
});
test("UTC month boundary matches the existing dashboard calendar", () => {
  assert.equal(countDueDonationSupports([], [beneficiary("a", { support_start_date: "2026-11-01" })], new Date("2026-11-01T00:30:00+06:00")), 0);
  assert.equal(countDueDonationSupports([], [beneficiary("a", { support_start_date: "2026-11-01" })], new Date("2026-11-01T00:00:00Z")), 1);
});

async function loadServerModule(file: string, imports: Record<string, unknown>) {
  const source = await readFile(file, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const context = vm.createContext({ exports, console: { error() {} }, Date: class extends Date { constructor() { super(now); } },
    require(name: string) { assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`); return imports[name]; } });
  new vm.Script(compiled.outputText, { filename: file }).runInContext(context);
  return exports;
}

test("server badge reader performs only minimal SELECTs and never invokes reminder creation", async () => {
  const calls: string[] = [];
  const rows = { donation_monthly_support: [reminder("a"), reminder("b")], donation_beneficiaries: [beneficiary("a"), beneficiary("b")] };
  const db = { from(table: keyof typeof rows) {
    calls.push(table);
    const query = { select(columns: string) { assert.ok(!columns.includes("*")); return query; },
      eq() { return query; }, then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: rows[table], error: null })); } };
    return query;
  } };
  const data = await loadServerModule("lib/donation-expenses/data.ts", {
    "server-only": {}, "@/lib/supabase/admin": { createSupabaseAdminClient: () => db },
    "@/lib/donation-expenses/reminder-count": { countDueDonationSupports },
  });
  assert.equal(await data.getDonationDueReminderCount(), 2);
  assert.deepEqual(calls.sort(), ["donation_beneficiaries", "donation_monthly_support"]);
});

test("donation read errors safely omit this badge instead of throwing away other module counts", async () => {
  const query = { select() { return query; }, eq() { return query; },
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: null, error: { code: "TEST_DENIED" } })); } };
  const data = await loadServerModule("lib/donation-expenses/data.ts", {
    "server-only": {}, "@/lib/supabase/admin": { createSupabaseAdminClient: () => ({ from: () => query }) },
    "@/lib/donation-expenses/reminder-count": { countDueDonationSupports },
  });
  assert.equal(await data.getDonationDueReminderCount(), 0);
});

test("admin work counts use the existing navigation key and preserve other badges", async () => {
  const query = { select() { return query; }, in() { return query; },
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ count: 7, error: null })); } };
  const data = await loadServerModule("lib/dashboard/work-counts.ts", {
    "server-only": {}, "@/lib/supabase/admin": { createSupabaseAdminClient: () => ({ from: () => query }) },
    "@/lib/crm/chatbot-inquiries": { getUnreadChatbotInquiryCount: async () => 3 },
    "@/lib/donation-expenses/data": { getDonationDueReminderCount: async () => 2 },
  });
  const counts = await data.getDashboardWorkCounts() as Record<string, number>;
  assert.equal(counts["donation-expenses"], 2);
  assert.equal(counts.crm, 3);
  assert.equal(counts.orders, 7);
  assert.equal(counts.purchasing, 7);
});
