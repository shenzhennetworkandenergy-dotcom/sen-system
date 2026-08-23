import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  buildQuotationTraceabilityLookup,
} from "../lib/quotations/access-policy.ts";
import {
  resolveLinkedSale,
  resolveSourceQuotation,
} from "../lib/quotations/traceability.ts";

test("quotation traceability lookup limits reverse links to the granted quotation scope", () => {
  assert.equal(
    buildQuotationTraceabilityLookup("sale-1", null, "employee-1"),
    null,
  );
  assert.deepEqual(
    buildQuotationTraceabilityLookup("sale-1", "all", "employee-1"),
    { convertedOrderId: "sale-1" },
  );
  assert.deepEqual(
    buildQuotationTraceabilityLookup("sale-1", "own", "employee-1"),
    { convertedOrderId: "sale-1", createdBy: "employee-1" },
  );
});

test("reverse source resolver skips inaccessible lookups and preserves broad or own query scope", async () => {
  const calls: Array<{ convertedOrderId: string; createdBy?: string }> = [];
  const reader = async (lookup: { convertedOrderId: string; createdBy?: string }) => {
    calls.push(lookup);
    return {
      data: lookup.createdBy === "other-employee"
        ? null
        : { id: "quotation-1", reference: "QT-20260824-001" },
      error: null,
    };
  };

  assert.equal(await resolveSourceQuotation(null, reader), null);
  assert.equal(await resolveSourceQuotation(undefined, reader), null);
  assert.equal(calls.length, 0);

  assert.deepEqual(
    await resolveSourceQuotation({ convertedOrderId: "sale-1" }, reader),
    { id: "quotation-1", reference: "QT-20260824-001" },
  );
  assert.deepEqual(calls, [{ convertedOrderId: "sale-1" }]);

  assert.equal(
    await resolveSourceQuotation(
      { convertedOrderId: "sale-1", createdBy: "other-employee" },
      reader,
    ),
    null,
  );
  assert.deepEqual(calls.at(-1), {
    convertedOrderId: "sale-1",
    createdBy: "other-employee",
  });

  assert.deepEqual(
    await resolveSourceQuotation(
      { convertedOrderId: "sale-1", createdBy: "employee-1" },
      reader,
    ),
    { id: "quotation-1", reference: "QT-20260824-001" },
  );
  assert.deepEqual(calls.at(-1), {
    convertedOrderId: "sale-1",
    createdBy: "employee-1",
  });
});

test("traceability readers return null for missing records and use generic errors", async () => {
  let sourceCalls = 0;
  assert.equal(
    await resolveSourceQuotation({ convertedOrderId: "sale-1" }, async () => {
      sourceCalls += 1;
      return { data: null, error: null };
    }),
    null,
  );
  assert.equal(sourceCalls, 1);
  await assert.rejects(
    () =>
      resolveSourceQuotation({ convertedOrderId: "sale-1" }, async () => ({
        data: null,
        error: { message: "database details must not reach staff" },
      })),
    { message: "Unable to load source quotation." },
  );

  let linkedCalls = 0;
  assert.equal(await resolveLinkedSale(null, async () => {
    linkedCalls += 1;
    return { data: null, error: null };
  }), null);
  assert.equal(linkedCalls, 0);
  assert.deepEqual(
    await resolveLinkedSale("sale-1", async (saleId) => {
      linkedCalls += 1;
      assert.equal(saleId, "sale-1");
      return { data: { id: "sale-1", order_number: "SO-20260824-001" }, error: null };
    }),
    { id: "sale-1", orderNumber: "SO-20260824-001" },
  );
  await assert.rejects(
    () => resolveLinkedSale("sale-1", async () => ({
      data: null,
      error: { message: "database details must not reach staff" },
    })),
    { message: "Unable to load linked sale." },
  );
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

test("staff traceability renders links from the existing quotation relationship only", () => {
  const saleData = readFileSync("lib/sales/data.ts", "utf8");
  const salePage = readFileSync("app/admin/sales/[saleId]/page.tsx", "utf8");
  const quotationPage = readFileSync(
    "app/admin/quotations/[id]/manage/page.tsx",
    "utf8",
  );
  const operations = readFileSync(
    "components/quotations/QuotationOperations.tsx",
    "utf8",
  );

  assert.match(saleData, /from\("quotation_requests"\)/);
  assert.match(saleData, /eq\("converted_order_id",\s*sourceLookup\.convertedOrderId\)/);
  assert.match(saleData, /eq\("created_by",\s*sourceLookup\.createdBy\)/);
  assert.match(salePage, /Source Quotation/);
  assert.match(salePage, /sourceQuotation/);
  assert.match(salePage, /resolveQuotationViewScope/);
  assert.match(salePage, /getSale\(saleId, quotationLookup\)/);
  assert.ok(salePage.indexOf("data.order.created_by") < salePage.indexOf("<DashboardShell"));
  assert.ok(quotationPage.indexOf("if (error || !quotation) notFound()") < quotationPage.indexOf('from("sales_orders")'));
  assert.match(quotationPage, /from\("sales_orders"\)/);
  assert.match(quotationPage, /order_number/);
  assert.match(operations, /Converted Sale/);
  assert.match(operations, /linkedSale/);
  const customerAndPublicFiles = [
    ...sourceFiles("app").filter((path) => !path.startsWith(join("app", "admin"))),
    ...sourceFiles("components/orders"),
  ];
  for (const path of customerAndPublicFiles) {
    assert.doesNotMatch(
      readFileSync(path, "utf8"),
      /Source Quotation|Converted Sale|sourceQuotation|linkedSale/,
      `customer/public route or order component must not expose internal traceability: ${path}`,
    );
  }
});

test("quotation to sale migrations do not add a second Sales-side quotation key", () => {
  const migrations = readdirSync("supabase/migrations")
    .filter((file) => file.endsWith(".sql"))
    .map((file) => readFileSync(join("supabase/migrations", file), "utf8"))
    .join("\n");

  assert.doesNotMatch(migrations, /sales_orders[\s\S]{0,160}source_quotation_id/i);
  assert.doesNotMatch(migrations, /source_quotation_id[\s\S]{0,160}sales_orders/i);
});
