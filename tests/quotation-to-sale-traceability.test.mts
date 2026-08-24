import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  buildSaleSourceQuotationLookup,
  buildQuotationTraceabilityLookup,
} from "../lib/quotations/access-policy.ts";
import {
  getConvertedSaleLink,
  getLegacyInvoiceConversion,
  getSaleSourceQuotationLink,
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

test("Sale source quotation lookup combines quotation access with the exact viewer identity", () => {
  const cases: Array<{
    role: string;
    permissions: string[];
    profileId: string;
    expected: { convertedOrderId: string; createdBy?: string } | null;
  }> = [
    { role: "admin", permissions: [], profileId: "admin-1", expected: { convertedOrderId: "sale-1" } },
    { role: "employee", permissions: ["quotations.view"], profileId: "employee-1", expected: { convertedOrderId: "sale-1" } },
    { role: "employee", permissions: ["quotations.view_all"], profileId: "employee-1", expected: { convertedOrderId: "sale-1" } },
    { role: "employee", permissions: ["quotations.view_own"], profileId: "employee-1", expected: { convertedOrderId: "sale-1", createdBy: "employee-1" } },
    { role: "employee", permissions: ["sales.view"], profileId: "employee-1", expected: null },
    { role: "employee", permissions: [], profileId: "employee-1", expected: null },
  ];

  for (const item of cases) {
    assert.deepEqual(
      buildSaleSourceQuotationLookup(
        "sale-1",
        item.role,
        new Set(item.permissions),
        item.profileId,
      ),
      item.expected,
    );
  }
});

test("staff traceability presentation models preserve Sale, converted-Sale, and legacy conversion boundaries", () => {
  assert.equal(getSaleSourceQuotationLink(null), null);
  assert.deepEqual(
    getSaleSourceQuotationLink({ id: "quotation-1", reference: "QT-20260824-001" }),
    {
      label: "Source Quotation",
      reference: "QT-20260824-001",
      href: "/admin/quotations/quotation-1/manage",
    },
  );

  const linkedSale = { id: "sale-1", orderNumber: "SO-20260824-001" };
  assert.equal(getConvertedSaleLink("accepted", linkedSale), null);
  assert.equal(getConvertedSaleLink("converted_to_sale", null), null);
  assert.deepEqual(getConvertedSaleLink("converted_to_sale", linkedSale), {
    label: "Converted Sale",
    number: "SO-20260824-001",
    href: "/admin/sales/sale-1",
  });

  assert.equal(getLegacyInvoiceConversion("converted_to_sale", "sale-1", "invoice-1"), null);
  assert.equal(getLegacyInvoiceConversion("converted_to_invoice", null, "invoice-1")?.saleLink, null);
  assert.equal(getLegacyInvoiceConversion("converted_to_invoice", null, "invoice-1")?.invoiceLink, null);
  assert.deepEqual(
    getLegacyInvoiceConversion("converted_to_invoice", "sale-1", null),
    {
      title: "Converted to Invoice",
      description: "This quotation is locked and linked to its sales records.",
      saleLink: { label: "Open sales order", href: "/admin/sales/sale-1" },
      invoiceLink: null,
    },
  );
  assert.deepEqual(
    getLegacyInvoiceConversion("converted_to_invoice", "sale-1", "invoice-1")?.invoiceLink,
    {
      label: "Open sales invoice",
      href: "/admin/sales/sale-1/documents/invoice-1",
    },
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
  await assert.rejects(
    () => resolveSourceQuotation({ convertedOrderId: "sale-1" }, async () => {
      throw new Error("raw source reader failure");
    }),
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
  await assert.rejects(
    () => resolveLinkedSale("sale-1", async () => {
      throw new Error("raw linked reader failure");
    }),
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
  assert.match(salePage, /getSaleSourceQuotationLink/);
  assert.match(salePage, /buildSaleSourceQuotationLookup/);
  assert.match(salePage, /getSale\(saleId, quotationLookup\)/);
  assert.ok(salePage.indexOf("getSaleAccessOwner") < salePage.indexOf("getSale(saleId, quotationLookup)"));
  assert.ok(salePage.indexOf("saleAccess.createdBy") < salePage.indexOf("getSale(saleId, quotationLookup)"));
  assert.ok(quotationPage.indexOf("if (error || !quotation) notFound()") < quotationPage.indexOf('from("sales_orders")'));
  assert.match(quotationPage, /from\("sales_orders"\)/);
  assert.match(quotationPage, /order_number/);
  assert.match(operations, /getConvertedSaleLink/);
  assert.match(operations, /getLegacyInvoiceConversion/);
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
