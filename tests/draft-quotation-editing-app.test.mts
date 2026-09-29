import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

async function draftEditingHelpers() {
  const helpers = await import("../lib/quotations/draft-editing.ts").catch(
    () => null,
  );
  assert.ok(helpers, "Draft editing behavior helpers must exist");
  return helpers;
}

test("Draft editing totals use canonical line and header commercial values", async () => {
  const helpers = await draftEditingHelpers();
  if (!helpers) return;

  assert.deepEqual(
    helpers.calculateDraftQuotationTotals(
      [
        {
          quantity: 2,
          unitPrice: 100,
          discountAmount: 10,
          taxAmount: 5,
        },
      ],
      2,
      3,
    ),
    {
      subtotal: 200,
      lineDiscount: 10,
      lineTax: 5,
      discount: 12,
      tax: 8,
      itemTotal: 195,
      total: 196,
    },
  );
});

test("Draft edit helpers map every editable field and fixed customer while preserving quotation identity outside the payload", async () => {
  const helpers = await draftEditingHelpers();
  if (!helpers) return;

  const initial = helpers.mapDraftQuotationEditInitialValues({
    id: "quote-1",
    reference: "QT-100",
    updated_at: "2026-08-25T00:00:00.000Z",
    subject: "Servers",
    company_name: "Sen",
    customer_tax_identification_number: "TIN-1",
    required_by: "2026-08-28",
    expiration_date: "2026-09-01",
    discount_amount: "2",
    tax_amount: "3",
    terms_and_conditions: "Terms",
    payment_terms: "Net 30",
    delivery_information: "Delivery",
    customer_notes: "Customer note",
    message: "Legacy note",
    internal_notes: "Internal note",
    quotation_request_items: [
      {
        product_id: "product-1",
        variation_id: "variation-1",
        quantity: "2",
        unit_price: "100",
        discount_amount: "10",
        tax_amount: "5",
      },
    ],
    profiles: {
      id: "customer-1",
      full_name: "Amina",
      email: "amina@example.com",
      phone: "+8801",
      company_name: "Sen",
    },
  });

  assert.deepEqual(initial.fixedCustomer, {
    id: "customer-1",
    full_name: "Amina",
    email: "amina@example.com",
    phone: "+8801",
    company_name: "Sen",
  });
  assert.deepEqual(initial.draft.items, [
    {
      productId: "product-1",
      variationId: "variation-1",
      quantity: "2",
      unitPrice: "100",
      discountAmount: "10",
      taxAmount: "5",
    },
  ]);
  assert.equal(initial.draft.customerNotes, "Customer note");
  assert.equal(initial.draft.reference, "QT-100");

  const payload = helpers.buildDraftQuotationUpdatePayload({
    expectedUpdatedAt: initial.draft.updatedAt,
    subject: initial.draft.subject,
    companyName: initial.draft.companyName,
    customerTaxIdentificationNumber: initial.draft.customerTaxIdentificationNumber,
    requiredBy: initial.draft.requiredBy,
    expirationDate: initial.draft.expirationDate,
    termsAndConditions: initial.draft.termsAndConditions,
    paymentTerms: initial.draft.paymentTerms,
    deliveryInformation: initial.draft.deliveryInformation,
    customerNotes: initial.draft.customerNotes,
    internalNotes: initial.draft.internalNotes,
    discountAmount: initial.draft.discountAmount,
    taxAmount: initial.draft.taxAmount,
    items: initial.draft.items,
  });
  assert.deepEqual(payload.requested_items, [
    {
      product_id: "product-1",
      variation_id: "variation-1",
      quantity: "2",
      unit_price: "100",
      discount_amount: "10",
      tax_amount: "5",
    },
  ]);
  for (const identityField of [
    "id",
    "reference",
    "profile_id",
    "customer_id",
    "created_by",
  ]) {
    assert.equal(identityField in payload, false, identityField);
  }
});

test("Draft edit helpers retain existing inactive lines without offering them for new selections", async () => {
  const helpers = await draftEditingHelpers();
  if (!helpers) return;

  const categories = helpers.categorizeDraftEditItems(
    new Set(["old-product:old-variation"]),
    [
      { productId: "old-product", variationId: "old-variation" },
      { productId: "active-product", variationId: null },
    ],
  );
  assert.deepEqual(categories.retainedItems, [
    { productId: "old-product", variationId: "old-variation" },
  ]);
  assert.deepEqual(categories.newItems, [
    { productId: "active-product", variationId: null },
  ]);
  assert.deepEqual(
    helpers.catalogueForDraftEditRow(
      [{ id: "active-product" }],
      { id: "old-product" },
      true,
    ).map((product: { id: string }) => product.id),
    ["active-product", "old-product"],
  );
  assert.deepEqual(
    helpers.catalogueForDraftEditRow(
      [{ id: "active-product" }],
      { id: "old-product" },
      false,
    ).map((product: { id: string }) => product.id),
    ["active-product"],
  );
});

test("Draft edit update runner invokes only the atomic RPC before audit and revalidation, and stale transitions use a renderable destination", async () => {
  const helpers = await draftEditingHelpers();
  if (!helpers) return;

  const events: string[] = [];
  const saved = await helpers.runDraftQuotationUpdate(
    {
      mutate: async (name: string, payload: { requested_quotation_id: string }) => {
        events.push(`${name}:${payload.requested_quotation_id}`);
        return true;
      },
      audit: async () => {
        events.push("audit");
      },
      revalidate: () => {
        events.push("revalidate");
      },
    },
    { requested_quotation_id: "quote-1" },
  );
  assert.equal(saved, true);
  assert.deepEqual(events, [
    "update_draft_quotation:quote-1",
    "audit",
    "revalidate",
  ]);
  assert.equal(
    helpers.draftEditErrorDestination("quote-1", "validation"),
    "/admin/quotations/quote-1/edit",
  );
  assert.equal(
    helpers.draftEditErrorDestination("quote-1", "stale"),
    "/admin/quotations/quote-1/manage",
  );
  assert.equal(
    helpers.draftEditErrorDestination("quote-1", "transition"),
    "/admin/quotations/quote-1/manage",
  );
});

test("Draft edit route loads only a scoped Draft with its fixed customer, full header, lines, and concurrency token", () => {
  const route = "app/admin/quotations/[id]/edit/page.tsx";
  assert.equal(existsSync(route), true, "the Draft edit route must exist");
  const page = source(route);

  assert.match(page, /params:\s*Promise<\{\s*id:\s*string\s*\}>/);
  assert.match(page, /requirePermission\("quotations\.edit"\)/);
  assert.match(page, /resolveQuotationViewScope/);
  assert.match(page, /\.eq\("created_by",\s*profile\.id\)/);
  assert.match(page, /\.eq\("status",\s*"draft"\)/);
  assert.match(page, /updated_at/);
  assert.match(page, /quotation_request_items\([^)]*product_id[^)]*variation_id[^)]*quantity[^)]*unit_price[^)]*discount_amount[^)]*tax_amount/);
  assert.match(page, /profiles!quotation_requests_profile_id_fkey/);
  assert.match(page, /<QuotationBuilder/);
  assert.match(page, /mode="edit"/);
});

test("quotation builder preserves create customer selection and supports a fixed-customer Draft edit initialized with every editable value", () => {
  const builder = source("components/quotations/QuotationBuilder.tsx");

  assert.match(builder, /mode\?:\s*"create"\s*\|\s*"edit"/);
  assert.match(builder, /initialDraft/);
  assert.match(builder, /fixedCustomer/);
  assert.match(builder, /mode === "create"/);
  assert.match(builder, /mode === "edit"/);
  assert.match(builder, /createQuotationCustomerAction\(previousState, form\)/);
  assert.match(builder, /<CustomerTypeahead/);
  assert.match(builder, /initialDraft\.items/);
  assert.match(builder, /initialDraft\.updatedAt/);
  assert.match(builder, /name="updated_at"/);
  assert.match(builder, /name="company_name"/);
  assert.match(builder, /name="customer_tax_identification_number"/);
  assert.match(builder, /name="required_by"/);
  assert.match(builder, /name="expiration_date"/);
  assert.match(builder, /name="payment_terms"/);
  assert.match(builder, /name="delivery_information"/);
  assert.match(builder, /name="terms_and_conditions"/);
  assert.match(builder, /name="message"/);
  assert.match(builder, /name="internal_notes"/);
  assert.match(builder, /name="discount_amount"/);
  assert.match(builder, /name="tax_amount"/);
  assert.match(builder, /\+ Add product/);
  assert.match(builder, /Remove/);
  assert.match(builder, /lineTotal/);
  assert.match(builder, /calculateDraftQuotationTotals/);
  assert.match(builder, /headerDiscount/);
  assert.match(builder, /headerTax/);
  assert.match(builder, /catalogueForDraftEditRow/);
  assert.match(builder, /retainedProducts/);
});

test("Draft edit action reauthenticates, validates a scoped exact Draft, passes the stale token to one atomic mutation RPC, audits, and revalidates readers", () => {
  const actions = source("app/admin/quotations/actions.ts");
  const helpers = source("lib/quotations/draft-editing.ts");
  const start = actions.indexOf("export async function updateDraftQuotationAction");
  assert.ok(start >= 0, "the dedicated Draft edit action must exist");
  const end = actions.indexOf("export async function", start + 1);
  const body = actions.slice(start, end === -1 ? undefined : end);

  assert.match(body, /requirePermission\("quotations\.edit"\)/);
  assert.match(body, /resolveQuotationViewScope/);
  assert.match(body, /if \(!scope\)/);
  assert.match(body, /\.eq\("created_by",\s*profile\.id\)/);
  assert.match(body, /quotation\.status !== "draft"/);
  assert.match(body, /parseQuotationItems/);
  assert.match(body, /product_variations/);
  assert.match(helpers, /update_draft_quotation/);
  assert.match(body, /buildDraftQuotationUpdatePayload\(\{[\s\S]*expectedUpdatedAt/);
  assert.match(helpers, /requested_expected_updated_at:\s*input\.expectedUpdatedAt/);
  assert.match(body, /writeAuditLog/);
  assert.match(body, /quotation\.draft_updated/);
  assert.match(body, /runDraftQuotationUpdate/);
  assert.match(actions, /draftEditErrorDestination/);
  assert.doesNotMatch(body, /\.from\("quotation_requests"\)\.update\(/);
  assert.doesNotMatch(body, /\.from\("quotation_request_items"\)\.(?:insert|delete|update)\(/);
  for (const path of [
    "/admin/quotations",
    "/admin/quotations/${quotationId}/manage",
    "/admin/quotations/${quotationId}/edit",
    "/admin/quotations/${quotationId}",
    "/account/quotations",
  ]) {
    assert.ok(
      body.includes(`revalidatePath(\`${path}\`)`) ||
        body.includes(`revalidatePath("${path}")`),
      `the edit action must revalidate ${path}`,
    );
  }
});

test("edit loader maps trusted values through the tested helper and fails closed when retained fallback reads fail", () => {
  const page = source("app/admin/quotations/[id]/edit/page.tsx");

  assert.match(page, /mapDraftQuotationEditInitialValues/);
  assert.match(page, /existingProductError/);
  assert.match(page, /existingVariationError/);
});

test("only scoped Drafts expose the full edit entry point and legacy commercial details", () => {
  const list = source("app/admin/quotations/page.tsx");
  const manage = source("components/quotations/QuotationOperations.tsx");
  const workflow = source("app/admin/quotations/workflow-actions.ts");

  assert.match(list, /quotation\.status === "draft"/);
  assert.match(list, /quotations\.edit/);
  assert.match(list, /Edit draft/);
  assert.match(manage, /quotation\.status === "draft"/);
  assert.match(manage, /\/admin\/quotations\/\$\{quotation\.id\}\/edit/);
  assert.match(workflow, /quotation\.status !== "draft"/);
  assert.match(workflow, /Only Draft quotations can have commercial details edited\./);
});

test("existing quotation creation, printed-document, workflow, and Sale-conversion boundaries remain intact", () => {
  const createAction = source("app/admin/quotations/actions.ts");
  const printRoute = source("app/admin/quotations/[id]/page.tsx");
  const saleAction = source("app/admin/sales/from-quotation/actions.ts");

  assert.match(createAction, /export async function createQuotationAction/);
  assert.match(createAction, /status:\s*"draft"/);
  assert.match(printRoute, /requireQuotationView/);
  assert.match(printRoute, /quotation_request_items/);
  assert.match(saleAction, /search_eligible_quotations_for_sale/);
});
