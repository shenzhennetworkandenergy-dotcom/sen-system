import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { changedCustomerAddressFields, changedCustomerFields, customerEditFields, normalizeCustomerEdit, rejectUnexpectedCustomerFields } from "../lib/customers/edit.ts";

const current = {
  id: "11111111-1111-4111-8111-111111111111", role: "customer", status: "active",
  email: "customer@sen.test", full_name: "Old Name", company_name: "Old Company",
  customer_type: "company", phone: "01700000000", alternate_phone: null,
  country: "Bangladesh", address_line: "Old road", city: "Dhaka", region: "Dhaka", postal_code: "1200",
};
const input = () => Object.fromEntries(customerEditFields.map((field) => [field, current[field]]));
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("existing profile values normalize without an update", () => {
  assert.deepEqual(changedCustomerFields(current, normalizeCustomerEdit(input())), {});
});
test("name, company, and phone can change individually", () => {
  const next = normalizeCustomerEdit({ ...input(), full_name: "New Name", company_name: "New Company", phone: "01800000000" });
  assert.deepEqual(changedCustomerFields(current, next), { full_name: "New Name", company_name: "New Company", phone: "01800000000" });
});
test("profile location change does not overwrite other fields", () => {
  const next = normalizeCustomerEdit({ ...input(), city: "Rangpur", address_line: "New road" });
  assert.deepEqual(changedCustomerFields(current, next), { address_line: "New road", city: "Rangpur" });
});
test("saved address update changes only edited columns", () => {
  const existing = { recipient_name: "Old Name", phone: "01700000000", address_line_1: "Old road", city: "Dhaka", country_code: "BD", latitude: 23.8, is_default_shipping: true };
  const next = { recipient_name: "Old Name", phone: "01700000000", address_line_1: "New road", city: "Dhaka", country_code: "BD" };
  assert.deepEqual(changedCustomerAddressFields(existing, next), { address_line_1: "New road" });
});
test("full name or company name and phone remain required", () => {
  assert.throws(() => normalizeCustomerEdit({ ...input(), full_name: "", company_name: "" }), /full name or company name/i);
  assert.throws(() => normalizeCustomerEdit({ ...input(), phone: "" }), /phone number/i);
});
test("customer type and country length are validated", () => {
  assert.throws(() => normalizeCustomerEdit({ ...input(), customer_type: "admin" }), /Individual or Company/);
  assert.throws(() => normalizeCustomerEdit({ ...input(), country: "X".repeat(101) }), /country/i);
});
test("legacy missing country or phone does not force unrelated edits", () => {
  const legacy = { ...current, phone: null, country: null };
  const next = normalizeCustomerEdit({ ...input(), phone: "", country: "", city: "Rangpur" }, { allowEmptyPhone: true });
  assert.deepEqual(changedCustomerFields(legacy, next), { city: "Rangpur" });
});
test("forged role, status, and email fields are rejected", () => {
  for (const field of ["role", "status", "email", "id"]) assert.throws(() => rejectUnexpectedCustomerFields([...customerEditFields, field], customerEditFields), /unsupported field/);
});
test("Admin-only edit route and both actions validate target role", () => {
  const page = source("../app/admin/users/[id]/edit/page.tsx");
  const actions = source("../app/admin/users/[id]/edit/actions.ts");
  assert.match(page, /requireProfile\(\["admin"\]\)/);
  assert.equal((actions.match(/requireProfile\(\["admin"\]\)/g) ?? []).length, 2);
  assert.equal((actions.match(/customer\.role !== "customer"/g) ?? []).length, 2);
});
test("button is customer-only and edit form prefills saved values", () => {
  const detail = source("../app/admin/users/[id]/page.tsx");
  const edit = source("../app/admin/users/[id]/edit/page.tsx");
  assert.match(detail, /isCustomer \? <a href=\{`\/admin\/users\/\$\{id\}\/edit`\}/);
  assert.match(edit, /defaultValue=\{customer\.full_name/);
  assert.match(edit, /defaultValue=\{address\.address_line_1/);
});
test("email editing is excluded and authentication phone is guarded", () => {
  const edit = source("../app/admin/users/[id]/edit/page.tsx");
  const actions = source("../app/admin/users/[id]/edit/actions.ts");
  assert.doesNotMatch(edit, /name="email"/);
  assert.match(actions, /auth\.data\.user\.phone/);
});
test("updates keep original IDs and only write profile or saved address rows", () => {
  const actions = source("../app/admin/users/[id]/edit/actions.ts");
  assert.match(actions, /\.eq\("id", id\)\.eq\("role", "customer"\)/);
  assert.match(actions, /\.eq\("id", address\)\.eq\("profile_id", id\)/);
  assert.doesNotMatch(actions, /\.insert\(|\.delete\(|sales_orders|quotation_requests|work_scheduler|customer_business_category_assignments/);
});
test("successful save refreshes customer detail", () => {
  const actions = source("../app/admin/users/[id]/edit/actions.ts");
  assert.match(actions, /revalidatePath\(`\/admin\/users\/\$\{id\}`\)/);
  assert.match(actions, /Customer information updated/);
  assert.match(actions, /Customer address updated/);
});
