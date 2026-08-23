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

test("basic customer input requires name email phone and address", () => {
  assert.throws(
    () =>
      normalizeBasicCustomerInput({
        fullName: "",
        companyName: "",
        email: "customer@example.com",
        phone: "",
        addressLine1: "",
      }),
    /Name, email, phone and address are required/,
  );
});

test("quotation quick-create stays on the page and selects the returned CRM customer", () => {
  const actions = readFileSync("app/admin/quotations/actions.ts", "utf8");
  const builder = readFileSync(
    "components/quotations/QuotationBuilder.tsx",
    "utf8",
  );
  const salesActions = readFileSync("app/admin/sales/actions.ts", "utf8");

  assert.match(actions, /export async function createQuotationCustomerAction/);
  assert.match(actions, /requirePermission\("quotations\.create"\)/);
  assert.match(builder, /createQuotationCustomerAction\(previousState, form\)/);
  assert.match(builder, /useActionState\(\s*createAndSelectCustomer/);
  assert.match(builder, /<CustomerTypeahead/);
  assert.match(builder, /setCustomerId\(nextState\.customer\.id\)/);
  assert.match(salesActions, /createBasicCustomerRecord/);
});
