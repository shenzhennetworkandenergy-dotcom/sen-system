import assert from "node:assert/strict";
import test from "node:test";

import {
  customerOptionLabel,
  filterCustomerOptions,
  type CustomerSearchOption,
} from "../lib/customers/search.ts";

const customers: CustomerSearchOption[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    full_name: "Amina Rahman",
    company_name: "Tex Rise Engineering",
    email: "amina@example.com",
    phone: "+8801711000001",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    full_name: "Bashir Ahmed",
    company_name: "Delta Controls",
    email: "bashir@delta.example",
    phone: "+8801812000002",
  },
];

test("customer type-ahead matches partial name company email and phone", () => {
  assert.deepEqual(filterCustomerOptions(customers, "min").map((item) => item.id), [customers[0].id]);
  assert.deepEqual(filterCustomerOptions(customers, "tex rise").map((item) => item.id), [customers[0].id]);
  assert.deepEqual(filterCustomerOptions(customers, "DELTA.EXAMPLE").map((item) => item.id), [customers[1].id]);
  assert.deepEqual(filterCustomerOptions(customers, "181200").map((item) => item.id), [customers[1].id]);
});

test("customer type-ahead excludes unrelated records and blank searches", () => {
  assert.deepEqual(filterCustomerOptions(customers, "unrelated"), []);
  assert.deepEqual(filterCustomerOptions(customers, "   "), []);
});

test("customer type-ahead limits results and creates the existing display label", () => {
  const many = Array.from({ length: 25 }, (_, index) => ({
    ...customers[0],
    id: `customer-${index}`,
    full_name: `Amina ${index}`,
  }));

  assert.equal(filterCustomerOptions(many, "amina").length, 20);
  assert.equal(
    customerOptionLabel(customers[0]),
    "Amina Rahman · amina@example.com",
  );
});
