import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import * as filters from "../lib/quotations/list-filters.ts";

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb";
const customer = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const customer2 = "bbbbbbbb-bbbb-4bbb-8bbb-000000000002";

function load(file: string, imports: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } });
  new vm.Script(compiled.outputText).runInContext(vm.createContext({ exports, console, AbortSignal, URL,
    require(name: string) { assert.ok(Object.hasOwn(imports, name), `Unexpected import ${name}`); return imports[name]; },
  }));
  return exports;
}

test("all filters are optional; valid filters combine without changing their meaning", () => {
  assert.equal(filters.quotationListFilters({}).error, null);
  const value = filters.quotationListFilters({ q: " QT-100 ", customer, status: "draft", date: "2026-11-09" });
  assert.equal(value.error, null); assert.equal(value.q, "QT-100"); assert.equal(value.customer, customer);
  assert.equal(value.range?.start, "2026-11-09T00:00:00+06:00");
  assert.equal(value.range?.end, "2026-11-10T00:00:00+06:00");
});
test("calendar validation includes leap days and exclusive next-day/month/year boundaries", () => {
  for (const bad of ["2026-02-29", "2026-11-31", "2026-13-01", "tomorrow", "2026-11-09T12:00:00Z"]) assert.equal(filters.quotationDayRange(bad), null);
  assert.equal(filters.quotationDayRange("2028-02-29")?.end, "2028-03-01T00:00:00+06:00");
  assert.equal(filters.quotationDayRange("2026-12-31")?.end, "2027-01-01T00:00:00+06:00");
});
test("malformed, repeated and oversized filters cannot silently broaden the list", () => {
  for (const params of [{ q: ["a", "b"] }, { date: "2026-02-30" }, { customer: "id,or(created_by.eq.other)" }, { status: "unknown" }, { q: "x".repeat(81) }]) {
    assert.ok(filters.quotationListFilters(params).error);
  }
});
test("LIKE metacharacters are literal and never become raw PostgREST expressions", () => {
  assert.equal(filters.literalQuotationPattern("QT_10%*\\"), "%QT\\_10\\%\\*\\\\%");
  assert.equal(filters.literalQuotationPattern("QT-12"), "%QT-12%");
});

async function renderPage(params: Record<string, unknown>, scope = "all", rows: Record<string, unknown>[] = []) {
  const calls: [string, ...unknown[]][] = [];
  const predicates: ((r: Record<string, unknown>) => boolean)[] = [];
  const query = {
    select(value: string) { calls.push(["select", value]); return query; },
    order() { return query; }, limit() { return query; },
    eq(key: string, value: string) { calls.push(["eq", key, value]); predicates.push(r => r[key] === value); return query; },
    ilike(key: string, value: string) { calls.push(["ilike", key, value]); predicates.push(r => String(r[key]).toLowerCase().includes(value.slice(1, -1).toLowerCase())); return query; },
    gte(key: string, value: string) { calls.push(["gte", key, value]); predicates.push(r => Date.parse(String(r[key])) >= Date.parse(value)); return query; },
    lt(key: string, value: string) { calls.push(["lt", key, value]); predicates.push(r => Date.parse(String(r[key])) < Date.parse(value)); return query; },
    then(resolve: (result: unknown) => unknown) { calls.push(["executed"]); return Promise.resolve({ data: rows.filter(r => predicates.every(p => p(r))).slice(0, 100), error: null }).then(resolve); },
  };
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  const pageModule = load("app/admin/quotations/page.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx }, "next/link": {}, "next/server": { connection: async () => {} },
    "@/components/dashboard/Shell": {}, "@/components/quotations/QuotationStatusBadge": {},
    "@/components/quotations/QuotationCustomerFilter": {},
    "@/lib/quotations/access": { requireQuotationView: async () => ({ profile: { id: owner, role: "employee" }, permissions: new Set(["quotations.view_own"]), quotationViewScope: scope }) },
    "@/lib/quotations/access-policy": { canOpenQuotationDocument: () => false },
    "@/lib/quotations/list-filters": filters,
    "@/lib/quotations/customer-options": { quotationCustomerOptions: async () => [{ id: customer, full_name: "Demo", email: null, company_name: null }] },
    "@/lib/supabase/admin": { createSupabaseAdminClient: () => ({ from: (table: string) => { calls.push(["from", table]); return query; } }) },
  });
  await (pageModule.default as (props: unknown) => Promise<unknown>)({ searchParams: Promise.resolve(params) });
  return { calls, matches: rows.filter(r => predicates.every(p => p(r))).slice(0, 100) };
}
test("page applies quotation reference, customer, date and status as an intersection", async () => {
  const { calls } = await renderPage({ q: "QT-10", customer, status: "draft", date: "2026-11-09" }, "own");
  for (const expected of [["eq", "created_by", owner], ["eq", "profile_id", customer], ["eq", "status", "draft"], ["ilike", "reference", "%QT-10%"], ["gte", "created_at", "2026-11-09T00:00:00+06:00"], ["lt", "created_at", "2026-11-10T00:00:00+06:00"]]) assert.ok(calls.some(c => JSON.stringify(c) === JSON.stringify(expected)));
});
test("date filter includes Bangladesh midnight and excludes the next midnight", async () => {
  const rows = ["2026-11-08T17:59:59.999Z", "2026-11-08T18:00:00Z", "2026-11-09T17:59:59.999Z", "2026-11-09T18:00:00Z"].map(created_at => ({ created_at }));
  assert.equal((await renderPage({ date: "2026-11-09" }, "all", rows)).matches.length, 2);
});
test("filtering happens in the database query before the existing 100-result limit", async () => {
  const rows = Array.from({ length: 110 }, (_, i) => ({ reference: `QT-${i}` }));
  assert.equal((await renderPage({ q: "QT-109" }, "all", rows)).matches[0].reference, "QT-109");
});
test("own-only employee filtering never expands into another creator's quotations", async () => {
  const rows = [{ created_by: owner, reference: "QT-1" }, { created_by: other, reference: "QT-1" }];
  assert.equal((await renderPage({ q: "QT-1" }, "own", rows)).matches.length, 1);
});
test("invalid filters stop list execution instead of showing unfiltered records", async () => {
  const { calls } = await renderPage({ customer: "not-a-uuid" });
  assert.ok(!calls.some(c => c[0] === "executed"));
});

async function customerReader(fail = false) {
  const urls: URL[] = [];
  const db = createClient("http://127.0.0.1:19099", "synthetic-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input)); urls.push(url);
      assert.equal(url.origin, "http://127.0.0.1:19099");
      if (fail) return new Response(JSON.stringify({ message: "private backend detail" }), { status: 503 });
      const rows = [{ id: customer, full_name: "Amina", email: "one@sen.test", company_name: "Demo" }, { id: customer2, full_name: "Amina", email: "two@sen.test", company_name: "Demo" }];
      return new Response(JSON.stringify(rows.map(row => ({ ...row, quotation_requests: [{ id: "internal" }] }))), { status: 200, headers: { "Content-Type": "application/json" } });
    } },
  });
  const readerModule = load("lib/quotations/customer-options.ts", {
    "server-only": {}, "@/lib/quotations/list-filters": filters,
    "@/lib/supabase/admin": { createSupabaseAdminClient: () => db },
  });
  return { urls, read: readerModule.quotationCustomerOptions as (context: unknown, search: unknown) => Promise<Record<string, unknown>[]> };
}
test("customer search uses supported scoped reverse-FK queries, bounded parent/child results", async () => {
  const { read, urls } = await customerReader();
  const results = await read({ profile: { id: owner }, quotationViewScope: "own" }, { q: "Amina" });
  assert.equal(results.length, 2); assert.equal(urls.length, 2);
  for (const url of urls) {
    assert.match(url.searchParams.get("select")!, /quotation_requests!quotation_requests_profile_id_fkey!inner/);
    assert.equal(url.searchParams.get("quotation_requests.created_by"), `eq.${owner}`);
    assert.equal(url.searchParams.get("limit"), "20");
    assert.equal(url.searchParams.get("quotation_requests.limit"), "1");
  }
  assert.equal(urls[0].searchParams.get("full_name"), "ilike.%Amina%");
  assert.equal(urls[1].searchParams.get("company_name"), "ilike.%Amina%");
  assert.ok(results.every(row => !Object.hasOwn(row, "quotation_requests")));
});
test("same-name customers retain distinct identities; duplicate query matches are merged", async () => {
  const { read } = await customerReader();
  const rows = await read({ profile: { id: owner }, quotationViewScope: "all" }, { q: "Amina" });
  assert.equal(rows.length, 2); assert.notEqual(rows[0].id, rows[1].id);
});
test("selected customer lookup is ID-bound and still own-scope restricted", async () => {
  const { read, urls } = await customerReader();
  await read({ profile: { id: owner }, quotationViewScope: "own" }, { id: customer });
  assert.equal(urls.length, 1); assert.equal(urls[0].searchParams.get("id"), `eq.${customer}`);
  assert.equal(urls[0].searchParams.get("quotation_requests.created_by"), `eq.${owner}`);
});
test("empty and oversized searches do not query profiles", async () => {
  const { read, urls } = await customerReader();
  for (const q of ["", " ", "x".repeat(81)]) assert.equal((await read({ profile: { id: owner }, quotationViewScope: "all" }, { q })).length, 0);
  assert.equal(urls.length, 0);
});
test("customer lookup failures never return a broader fallback or backend detail", async () => {
  const { read } = await customerReader(true);
  await assert.rejects(read({ profile: { id: owner }, quotationViewScope: "own" }, { q: "Amina" }), /QUOTATION_CUSTOMER_LOOKUP_UNAVAILABLE/);
});
test("search endpoint is authenticated, read-only, private and does not echo backend errors", () => {
  const api = readFileSync("app/api/quotations/customers/route.ts", "utf8");
  assert.match(api, /await requireQuotationView\(\)/); assert.match(api, /private, no-store/);
  assert.doesNotMatch(api, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(api, /console\.|\.message/);
});
