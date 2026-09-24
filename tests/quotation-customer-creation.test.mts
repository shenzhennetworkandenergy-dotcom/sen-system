import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  basicCustomerInputFromForm,
  normalizeBasicCustomerInput,
} from "../lib/customers/basic.ts";

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
      alternatePhone: null,
      addressLine1: "12 Motijheel, Dhaka",
      city: "Not specified",
      country: "Bangladesh",
      countryCode: "BD",
    },
  );
});

test("basic customer input preserves existing profile and address columns", () => {
  const form = new FormData();
  form.set("full_name", "  Li Wei  ");
  form.set("company_name", "  Shenzhen Example Co.  ");
  form.set("email", "  LI.WEI@EXAMPLE.CN  ");
  form.set("phone", "  +86 138 0000 0000  ");
  form.set("alternate_phone", "  +86 755 8888 0000  ");
  form.set("address_line_1", "  Nanshan Science Park  ");
  form.set("city", "  Shenzhen  ");
  form.set("country", "  China  ");
  form.set("country_code", " cn ");

  assert.deepEqual(basicCustomerInputFromForm(form), {
    fullName: "Li Wei",
    companyName: "Shenzhen Example Co.",
    email: "li.wei@example.cn",
    phone: "+86 138 0000 0000",
    alternatePhone: "+86 755 8888 0000",
    addressLine1: "Nanshan Science Park",
    city: "Shenzhen",
    country: "China",
    countryCode: "CN",
  });
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

test("Sales and Quotations reuse the authoritative shared Add Customer form", () => {
  const actions = readFileSync("app/admin/quotations/actions.ts", "utf8");
  const builder = readFileSync(
    "components/quotations/QuotationBuilder.tsx",
    "utf8",
  );
  const salesPage = readFileSync("app/admin/sales/new/page.tsx", "utf8");
  const sharedForm = readFileSync(
    "components/customers/AddCustomerForm.tsx",
    "utf8",
  );
  const duplicateRoute = readFileSync(
    "app/api/admin/customers/duplicates/route.ts",
    "utf8",
  );
  const salesActions = readFileSync("app/admin/sales/actions.ts", "utf8");

  assert.match(actions, /export async function createQuotationCustomerAction/);
  assert.match(actions, /requirePermission\("quotations\.create"\)/);
  assert.match(builder, /<AddCustomerForm/);
  assert.match(builder, /onCustomerResolved=/);
  assert.match(builder, /<CustomerTypeahead/);
  assert.match(salesPage, /<AddCustomerForm/);
  assert.match(sharedForm, /<BusinessCardOcrAssistant/);
  assert.match(sharedForm, />Save Customer</);
  assert.match(duplicateRoute, /requirePermission/);
  assert.match(duplicateRoute, /findPossibleCustomers/);
  assert.match(salesActions, /createBasicCustomerRecord/);
});
