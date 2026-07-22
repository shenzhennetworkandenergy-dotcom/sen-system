import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const required = [
  "supabase/migrations/202607220008_inventory_standardization_admin_controls.sql",
  "supabase/tests/inventory_standardization_admin_controls.sql",
  "app/admin/inventory/details/page.tsx",
  "components/ui/ConfirmSubmitButton.tsx",
];
for (const file of required) if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing standardization file: ${file}`);

const migration = read(required[0]);
for (const token of ["currency = 'BDT'", "SEN-CISCO-N3K-C3172PQ", "phase3_receive_serialized_stock", "Enterprise Servers", "default_warehouse_id"]) if (!migration.includes(token)) throw new Error(`Standardization migration is missing ${token}`);

const inventory = read("app/admin/inventory/page.tsx");
if (!inventory.includes("/admin/inventory/details?metric=")) throw new Error("Inventory summary cards are not linked to detail views.");
const detail = read("app/admin/inventory/details/page.tsx");
for (const token of ["Current location", "serialized unit(s)", 'currency: "BDT"']) if (!detail.includes(token)) throw new Error(`Inventory detail route is missing ${token}`);

const productForm = read("components/inventory/ProductForm.tsx");
if (!productForm.includes('name="currency" value="BDT"')) throw new Error("Product administration is not locked to BDT.");
const productActions = read("app/admin/products/actions.ts");
if (!productActions.includes("deleteProductAction") || !productActions.includes("business records remain intact")) throw new Error("Guarded product deletion is missing.");
const catalogueActions = read("app/admin/catalog-actions.ts");
for (const token of ["deleteBrandAction", "deleteAttributeAction"]) if (!catalogueActions.includes(token)) throw new Error(`Catalogue deletion is missing ${token}`);

const userActions = read("app/admin/users/[id]/actions.ts");
for (const token of ["resetUserPasswordAction", "deleteUserAction", "final active administrator", "password value was not recorded"]) if (!userActions.includes(token)) throw new Error(`Account administration is missing ${token}`);
const userPage = read("app/admin/users/[id]/page.tsx");
for (const token of ["Authentication account", "Passwords are never readable", "Set temporary password", "Delete user permanently"]) if (!userPage.includes(token)) throw new Error(`User detail is missing ${token}`);
if (/display current password|show current password/i.test(userPage)) throw new Error("The UI must never claim that stored passwords are readable.");

console.log("Inventory standardization and guarded admin controls verification passed.");
