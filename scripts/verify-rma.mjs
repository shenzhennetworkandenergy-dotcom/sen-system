import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/202608010008_rma_warranty_claims.sql", root), "utf8");
const resolutionMigration = await readFile(new URL("supabase/migrations/202608010010_rma_resolution_values.sql", root), "utf8");
const grantMigration = await readFile(new URL("supabase/migrations/202608010011_rma_internal_function_grants.sql", root), "utf8");

for (const table of ["warranty_coverages", "rma_claims", "rma_events", "rma_attachments"])
  assert.match(migration, new RegExp(`create table (?:if not exists )?public\\.${table}\\b`, "i"), `Missing ${table}`);
for (const fn of ["submit_rma_claim", "transition_rma_claim", "assign_rma_claim"])
  assert.match(migration, new RegExp(`function public\\.${fn}\\b`, "i"), `Missing ${fn}`);
for (const permission of ["rma.view", "rma.create", "rma.review", "rma.assign", "rma.receive", "rma.resolve", "rma.close", "rma.manage_attachments", "rma.override_warranty"])
  assert.ok(migration.includes(permission), `Missing permission ${permission}`);
for (const status of ["submitted", "under_review", "return_requested", "product_received", "resolution_in_progress", "closed"])
  assert.ok(migration.includes(`'${status}'`), `Missing RMA status ${status}`);
for (const resolution of ["repaired", "replaced", "refund_approved", "credit_issued", "claim_rejected", "no_fault_found", "damaged_beyond_repair_retired"])
  assert.ok(resolutionMigration.includes(`'${resolution}'`), `Missing database-supported RMA resolution ${resolution}`);
assert.match(migration, /alter table public\.products[\s\S]*warranty_enabled/i);
assert.match(migration, /alter table public\.sales_order_items[\s\S]*warranty_duration_months_snapshot/i);
assert.match(migration, /alter table public\.customer_notifications[\s\S]*rma_status/i);
assert.match(migration, /security definer[\s\S]*set search_path\s*=\s*''/i);
assert.match(grantMigration, /revoke execute on function public\.refresh_warranty_coverages\(uuid\)[\s\S]*from public, anon, authenticated/i);
assert.match(grantMigration, /grant execute on function public\.refresh_warranty_coverages\(uuid\)[\s\S]*to service_role/i);

for (const route of [
  "app/account/rma/page.tsx",
  "app/account/rma/new/page.tsx",
  "app/account/rma/[id]/page.tsx",
  "app/admin/rma/page.tsx",
  "app/admin/rma/[id]/page.tsx",
]) await access(new URL(route, root));

const [nav, routes, productForm, accountOrder, adminRma, attachmentAction, attachmentRoute] = await Promise.all([
  readFile(new URL("lib/navigation/dashboard.ts", root), "utf8"),
  readFile(new URL("lib/constants/routes.ts", root), "utf8"),
  readFile(new URL("components/inventory/ProductForm.tsx", root), "utf8"),
  readFile(new URL("app/account/orders/[id]/page.tsx", root), "utf8"),
  readFile(new URL("app/admin/rma/[id]/page.tsx", root), "utf8"),
  readFile(new URL("app/account/rma/actions.ts", root), "utf8"),
  readFile(new URL("app/rma-attachments/[id]/route.ts", root), "utf8"),
]);
assert.match(nav, /label:\s*"RMA(?: & Warranty)?"/);
assert.match(routes, /adminRma/);
assert.match(routes, /accountRma/);
for (const field of ["warranty_enabled", "warranty_duration_months", "warranty_terms", "warranty_exclusions"])
  assert.ok(productForm.includes(field), `Product form missing ${field}`);
assert.match(accountOrder, /Claim Warranty/);
assert.match(adminRma, /RMA timeline/);
assert.match(attachmentAction, /storage\.from\("rma-attachments"\)/);
assert.match(attachmentRoute, /storage\.from\("rma-attachments"\)/);
for (const [name, source] of [["admin RMA detail", adminRma], ["customer RMA order", accountOrder]]) {
  assert.doesNotMatch(source, /Â|Ã/, `${name} contains mojibake text`);
}

console.log("RMA static verification passed: database, permissions, routes, product warranty fields, customer claims, and staff workflow are present.");
