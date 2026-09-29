import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeBasicCustomerInput } from "../lib/customers/basic.ts";

test("basic customer input is normalized consistently for Sales and Quotations", () => {
  assert.deepEqual(
    normalizeBasicCustomerInput({
      fullName: "  Amina Rahman  ",
      companyName: "  Tex Rise Engineering  ",
      email: "  AMINA@EXAMPLE.COM  ",
      phone: "  +8801711000001  ",
      addressLine1: "  12 Motijheel, Dhaka  ",
    }),
    {
      fullName: "Amina Rahman",
      companyName: "Tex Rise Engineering",
      email: "amina@example.com",
      phone: "+8801711000001",
      addressLine1: "12 Motijheel, Dhaka",
    },
  );
});

test("company customer is valid without contact or email", () => {
  assert.deepEqual(
    normalizeBasicCustomerInput({
      fullName: "",
      companyName: "AA Yarn Mills Ltd",
      email: "",
      phone: "+8801711000001",
      addressLine1: "Dhaka",
    }),
    {
      fullName: null,
      companyName: "AA Yarn Mills Ltd",
      email: null,
      phone: "+8801711000001",
      addressLine1: "Dhaka",
    },
  );
});

test("individual customer is valid without company or email", () => {
  const customer = normalizeBasicCustomerInput({
    fullName: "Easher Uddin",
    companyName: "",
    email: "",
    phone: "+8801711000001",
    addressLine1: "Dhaka",
  });
  assert.equal(customer.fullName, "Easher Uddin");
  assert.equal(customer.companyName, null);
  assert.equal(customer.email, null);
});

test("basic customer input requires a company or full name", () => {
  assert.throws(
    () =>
      normalizeBasicCustomerInput({
        fullName: "",
        companyName: "",
        email: "customer@example.com",
        phone: "+8801711000001",
        addressLine1: "Dhaka",
      }),
    /Company name or full name is required/,
  );
});

test("basic customer input requires phone and full address", () => {
  assert.throws(
    () => normalizeBasicCustomerInput({ fullName: "Easher Uddin", email: "", phone: "", addressLine1: "Dhaka" }),
    /Phone is required/,
  );
  assert.throws(
    () => normalizeBasicCustomerInput({ fullName: "Easher Uddin", email: "", phone: "+8801711000001", addressLine1: "" }),
    /Full address is required/,
  );
});

test("quotation quick-create stays on the page and selects the returned CRM customer", () => {
  const actions = readFileSync("app/admin/quotations/actions.ts", "utf8");
  const builder = readFileSync(
    "components/quotations/QuotationBuilder.tsx",
    "utf8",
  );
  const salesActions = readFileSync("app/admin/sales/actions.ts", "utf8");
  const customerFields = readFileSync(
    "components/customers/BasicCustomerFields.tsx",
    "utf8",
  );
  const salesForm = readFileSync("app/admin/sales/new/page.tsx", "utf8");
  const cargoForm = readFileSync("app/admin/cargo-tracking/new/page.tsx", "utf8");
  const rmbForm = readFileSync(
    "app/admin/rmb-payments/new/RmbPaymentForm.tsx",
    "utf8",
  );

  assert.match(actions, /export async function createQuotationCustomerAction/);
  assert.match(actions, /requirePermission\("quotations\.create"\)/);
  assert.match(builder, /createQuotationCustomerAction\(previousState, form\)/);
  assert.match(builder, /useActionState\(\s*createAndSelectCustomer/);
  assert.match(builder, /<CustomerTypeahead/);
  assert.match(builder, /setCustomerId\(nextState\.customer\.id\)/);
  assert.match(salesActions, /createBasicCustomerRecord/);
  assert.match(customerFields, /placeholder="Company name"/);
  assert.match(customerFields, /placeholder="Full name \/ Contact person"/);
  assert.doesNotMatch(customerFields, /name="email"[\s\S]{0,80}required/);
  for (const form of [builder, salesForm, cargoForm, rmbForm]) {
    assert.match(form, /<BasicCustomerFields/);
  }
});

test("email-optional persistence keeps the auth user id and uses required phone", () => {
  const persistence = readFileSync("lib/customers/create-basic.ts", "utf8");
  assert.match(persistence, /\{ phone: input\.phone, phone_confirm: true \}/);
  assert.match(persistence, /const customerId = created\.data\.user\.id/);
  assert.match(persistence, /id: customerId/);
});

test("quotation document renders company as the billing entity and contact second", () => {
  const document = readFileSync("app/admin/quotations/[id]/page.tsx", "utf8");
  assert.match(document, /companyName \|\| customer\?\.full_name \|\| customer\?\.email/);
  assert.match(document, /`Contact: \$\{customer\.full_name\}`/);
  assert.match(document, /title="Quotation for"[\s\S]*company=\{contactName\}/);
});
