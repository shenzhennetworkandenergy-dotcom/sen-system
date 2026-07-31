import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const componentFiles = [
  ["components/hr/EmployeeForm.tsx", "salary_currency"],
  ["app/admin/hr/payroll/page.tsx", "currency"],
  ["components/accounting/JournalForm.tsx", "currency"],
  ["components/crm/CrmForms.tsx", "currency"],
  ["components/purchasing/SupplierForm.tsx", "default_currency"],
  ["components/purchasing/PurchaseOrderBuilder.tsx", "currency"],
  ["components/orders/OrderBuilder.tsx", "currency"],
];

for (const [path, name] of componentFiles) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  assert.match(source, /CurrencyCombobox/, `${path} must use CurrencyCombobox`);
  assert.match(
    source,
    new RegExp(`<CurrencyCombobox[^>]*name=["']${name}["']`),
    `${path} must submit ${name} through CurrencyCombobox`,
  );
}

for (const path of [
  "app/admin/hr/hr-actions.ts",
  "app/admin/accounting/actions.ts",
  "app/admin/crm/actions.ts",
  "app/admin/purchasing/actions.ts",
  "app/admin/orders/actions.ts",
]) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  assert.match(
    source,
    /normalizeCurrencyCode/,
    `${path} must validate typed currency codes on the server`,
  );
}

const productForm = await readFile(
  new URL("../components/inventory/ProductForm.tsx", import.meta.url),
  "utf8",
);
assert.match(productForm, /name="currency" value="BDT"/);

console.log("Editable currency inputs use searchable ISO suggestions.");

