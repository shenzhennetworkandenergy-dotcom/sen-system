import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as cashbook from "../lib/accounting/cashbook.ts";

const message = "Close the previous personal cashbook day before continuing";
const ownerA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ownerB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
type Day = { business_date: string; is_closed: boolean | null; cashbook_scope: string; cashbook_owner_id: string };
const day = (date: string, owner = ownerA, closed: boolean | null = false, scope = "PERSONAL"): Day => ({
  business_date: date, is_closed: closed, cashbook_scope: scope, cashbook_owner_id: owner,
});

test("the warning includes the actual blocking date in brackets", () => {
  assert.equal(cashbook.formatCashbookPredecessorError(message, "2026-11-05"), `${message} (2026-11-05)`);
});
test("unrelated errors and already dated warnings stay unchanged", () => {
  for (const error of ["Permission denied", "This personal cashbook day is closed", `${message} (2026-11-05)`]) {
    assert.equal(cashbook.formatCashbookPredecessorError(error, "2026-11-04"), error);
    assert.equal(cashbook.isPersonalCashbookPredecessorError(error), false);
  }
});
test("unknown or invalid dates never turn into today's or the selected date", () => {
  for (const date of [null, "", "2026-02-30", "2026-11-05T00:00:00Z", "not-a-date", "<script>"]) {
    assert.equal(cashbook.formatCashbookPredecessorError(message, date), message);
  }
});
test("valid leap dates and punctuation are handled without timezone conversion", () => {
  assert.equal(cashbook.formatCashbookPredecessorError(`${message}.`, "2028-02-29"), `${message} (2028-02-29)`);
  assert.equal(cashbook.isPersonalCashbookPredecessorError(` ${message.toUpperCase()} `), true);
});

async function reader(rows: Day[], error: { code: string } | null = null) {
  const calls: { method: string; args: unknown[] }[] = [];
  const filters: ((row: Day) => boolean)[] = [];
  let descending = false, max = 0;
  const query = {
    select(...args: unknown[]) { calls.push({ method: "select", args }); return query; },
    eq(key: keyof Day, value: string) { calls.push({ method: "eq", args: [key, value] }); filters.push(row => row[key] === value); return query; },
    lt(key: "business_date", value: string) { calls.push({ method: "lt", args: [key, value] }); filters.push(row => row[key] < value); return query; },
    order(key: string, options: { ascending: boolean }) { calls.push({ method: "order", args: [key, options] }); descending = !options.ascending; return query; },
    limit(value: number) { calls.push({ method: "limit", args: [value] }); max = value; return query; },
    async maybeSingle() {
      const selected = rows.filter(row => filters.every(filter => filter(row)))
        .sort((a, b) => a.business_date.localeCompare(b.business_date) * (descending ? -1 : 1)).slice(0, max);
      return { data: selected[0] ?? null, error };
    },
  };
  const db = { from(table: string) { calls.push({ method: "from", args: [table] }); return query; } };
  const source = await readFile("lib/accounting/data.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports: { getBlockingPersonalCashbookDate?: (owner: string, selectedDate: string) => Promise<string | null> } = {};
  const imports: Record<string, unknown> = {
    "server-only": {}, "@/lib/accounting/cashbook": cashbook,
    "@/lib/supabase/admin": { createSupabaseAdminClient: () => db },
  };
  const context = vm.createContext({ exports, console: { error() {} },
    require(name: string) { assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`); return imports[name]; } });
  new vm.Script(compiled.outputText, { filename: "accounting/data.ts" }).runInContext(context);
  assert.ok(exports.getBlockingPersonalCashbookDate);
  return { read: exports.getBlockingPersonalCashbookDate, calls };
}

test("latest same-owner PERSONAL predecessor is selected, not yesterday or another user's day", async () => {
  const { read, calls } = await reader([
    day("2026-11-01", ownerA, true), day("2026-11-05"), day("2026-11-08"), day("2026-11-09"),
    day("2026-11-07", ownerB), day("2026-11-07", ownerA, false, "LEGACY_ATTRIBUTED"),
  ]);
  assert.equal(await read(ownerA, "2026-11-08"), "2026-11-05");
  assert.deepEqual(calls.find(call => call.method === "select")?.args, ["business_date,is_closed"]);
  assert.ok(calls.some(call => call.method === "eq" && call.args[0] === "cashbook_owner_id" && call.args[1] === ownerA));
  assert.ok(calls.some(call => call.method === "eq" && call.args[0] === "cashbook_scope" && call.args[1] === "PERSONAL"));
  assert.ok(!calls.some(call => call.method === "eq" && call.args[0] === "is_closed"));
});
test("employee and admin owner identities stay isolated", async () => {
  const { read } = await reader([day("2026-11-05"), day("2026-11-07", ownerB)]);
  assert.equal(await read(ownerB, "2026-11-08"), "2026-11-07");
});
test("a closed immediate predecessor does not expose an older open date", async () => {
  const { read } = await reader([day("2026-11-02"), day("2026-11-07", ownerA, true)]);
  assert.equal(await read(ownerA, "2026-11-08"), null);
});
test("the selected day and future days are never named as the predecessor", async () => {
  const { read } = await reader([day("2026-11-08"), day("2026-11-09")]);
  assert.equal(await read(ownerA, "2026-11-08"), null);
});
test("no personal predecessor, legacy-only history or unknown state preserves the generic warning", async () => {
  for (const rows of [[], [day("2026-11-07", ownerA, false, "LEGACY_GLOBAL")], [day("2026-11-07", ownerA, null)]]) {
    const { read } = await reader(rows);
    assert.equal(cashbook.formatCashbookPredecessorError(message, await read(ownerA, "2026-11-08")), message);
  }
});
test("read errors cannot fabricate a date or perform a mutation", async () => {
  const { read, calls } = await reader([day("2026-11-05")], { code: "TEST_DENIED" });
  assert.equal(await read(ownerA, "2026-11-08"), null);
  assert.ok(calls.every(call => ["from", "select", "eq", "lt", "order", "limit"].includes(call.method)));
});
test("missing owner or invalid selected date never queries the database", async () => {
  const { read, calls } = await reader([]);
  assert.equal(await read("", "2026-11-08"), null);
  assert.equal(await read(ownerA, "2026-02-30"), null);
  assert.deepEqual(calls, []);
});
test("page derives owner from authenticated profile and only enriches this warning", async () => {
  const page = await readFile("app/admin/accounting/page.tsx", "utf8");
  assert.match(page, /requireAnyPermission\(\["accounting\.view", "accounting\.manage_cashbook"\]\)/);
  assert.match(page, /isPersonalCashbookPredecessorError\(params\.error\)/);
  assert.match(page, /getBlockingPersonalCashbookDate\(profile\.id, selectedDate\)/);
  assert.match(page, /\{errorMessage\}/);
});
