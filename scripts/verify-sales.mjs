import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const required = [
  "supabase/migrations/202607230001_minimal_sales_module.sql",
  "supabase/tests/minimal_sales.sql",
  "app/admin/sales/page.tsx",
  "app/admin/sales/new/page.tsx",
  "app/admin/sales/[saleId]/page.tsx",
  "app/admin/sales/[saleId]/documents/[documentId]/page.tsx",
  "app/admin/sales/actions.ts",
  "components/sales/SaleBuilder.tsx",
  "lib/sales/data.ts",
  "app/account/sales/page.tsx",
  "app/admin/users/[id]/sales/page.tsx",
  "docs/SALES.md",
];
for (const file of required) if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing Sales file: ${file}`);

const migration = read(required[0]);
for (const token of ["create_minimal_sale", "record_sale_payment", "generate_sale_document", "sale_price_adjustments", "sale_payments", "sale_documents"]) {
  if (!migration.includes(token)) throw new Error(`Sales migration is missing ${token}`);
}
const actions = read("app/admin/sales/actions.ts");
for (const token of ["sales.create", "sales.reserve_stock", "sales.cancel", "sales.record_payment", "sales.create_invoice", "create_minimal_sale"]) {
  if (!actions.includes(token)) throw new Error(`Sales actions are missing ${token}`);
}
const navigation = read("lib/navigation/dashboard.ts");
if (!/label:\s*"Sales"/.test(navigation) || !navigation.includes("routes.adminSales")) throw new Error("Sales navigation is not operational");
const invoice = read("app/admin/sales/[saleId]/documents/[documentId]/page.tsx");
for (const token of ["Amount paid", "Remaining balance", "Payment method", "Date and time", "sale_payments", "downloadName"]) {
  if (!invoice.includes(token)) throw new Error(`Sales invoice is missing ${token}`);
}
const printButton = read("components/sales/PrintDocumentButton.tsx");
for (const token of ["fileName", "document.title", "window.print()"]) {
  if (!printButton.includes(token)) throw new Error(`Invoice download naming is missing ${token}`);
}
const packageJson = JSON.parse(read("package.json"));
if (!packageJson.scripts["test:sales"]) throw new Error("Sales verification script is not registered");
console.log("Minimal Sales static verification passed.");
