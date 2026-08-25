import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

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
});

test("Draft edit action reauthenticates, validates a scoped exact Draft, passes the stale token to one atomic mutation RPC, audits, and revalidates readers", () => {
  const actions = source("app/admin/quotations/actions.ts");
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
  assert.match(body, /update_draft_quotation/);
  assert.match(body, /requested_expected_updated_at:\s*expectedUpdatedAt/);
  assert.match(body, /writeAuditLog/);
  assert.match(body, /quotation\.draft_updated/);
  assert.equal((body.match(/db\.rpc\(/g) ?? []).length, 1);
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
