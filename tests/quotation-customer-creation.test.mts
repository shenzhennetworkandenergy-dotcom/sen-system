import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeBasicCustomerInput } from "../lib/customers/basic.ts";

test("quotation customer input is normalized before account creation", () => {
  assert.deepEqual(
    normalizeBasicCustomerInput({
      fullName: "  Rahim Customer  ",
      email: "  RAHIM.CUSTOMER@Example.COM  ",
      phone: "  +880 1700 000000  ",
      addressLine1: "  House 7, Road 3, Dhaka  ",
    }),
    {
      fullName: "Rahim Customer",
      email: "rahim.customer@example.com",
      phone: "+880 1700 000000",
      addressLine1: "House 7, Road 3, Dhaka",
    },
  );

  const bounded = normalizeBasicCustomerInput({
    fullName: `A${"n".repeat(200)}`,
    email: "customer@example.com",
    phone: `+${"8".repeat(80)}`,
    addressLine1: `H${"o".repeat(300)}`,
  });
  assert.equal(bounded.fullName.length, 160);
  assert.equal(bounded.phone.length, 50);
  assert.equal(bounded.addressLine1.length, 240);
});

test("quotation customer input rejects missing fields and malformed email", () => {
  assert.throws(
    () => normalizeBasicCustomerInput({ fullName: "", email: "customer@example.com", phone: "123", addressLine1: "Dhaka" }),
    /name.*required/i,
  );
  assert.throws(
    () => normalizeBasicCustomerInput({ fullName: "Customer", email: "not-an-email", phone: "123", addressLine1: "Dhaka" }),
    /email.*valid/i,
  );
  assert.throws(
    () => normalizeBasicCustomerInput({ fullName: "Customer", email: "customer@example.com", phone: "", addressLine1: "Dhaka" }),
    /phone.*required/i,
  );
  assert.throws(
    () => normalizeBasicCustomerInput({ fullName: "Customer", email: "customer@example.com", phone: "123", addressLine1: "" }),
    /address.*required/i,
  );
});

test("Create Quotation exposes a quotation-authorized add customer workflow", async () => {
  const [page, action] = await Promise.all([
    readFile("app/admin/quotations/new/page.tsx", "utf8"),
    readFile("app/admin/quotations/actions.ts", "utf8"),
  ]);

  assert.match(page, /createQuotationCustomerAction/);
  assert.match(page, /Add a new customer/);
  assert.match(page, /name="full_name"/);
  assert.match(page, /name="email"/);
  assert.match(page, /name="phone"/);
  assert.match(page, /name="address_line_1"/);
  assert.match(page, /Add customer/);

  const customerAction = action.slice(action.indexOf("createQuotationCustomerAction"));
  assert.match(customerAction, /requirePermission\("quotations\.create"\)/);
  assert.match(customerAction, /normalizeBasicCustomerInput/);
  assert.match(customerAction, /auth\.admin\.createUser/);
  assert.match(customerAction, /customer_addresses/);
  assert.match(customerAction, /auth\.admin\.deleteUser/);
  assert.match(customerAction, /quotation\.customer_created/);
  assert.match(customerAction, /revalidatePath\("\/admin\/quotations\/new"\)/);
});
