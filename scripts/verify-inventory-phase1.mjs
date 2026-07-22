import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/202607220001_inventory_serial_phase_1.sql", root), "utf8");
const productActions = await readFile(new URL("app/admin/products/actions.ts", root), "utf8");
const inventoryActions = await readFile(new URL("app/admin/inventory/actions.ts", root), "utf8");
const sanitizer = await readFile(new URL("lib/inventory/html.ts", root), "utf8");
const labels = await readFile(new URL("lib/inventory/labels.ts", root), "utf8");
const navigation = await readFile(new URL("lib/navigation/dashboard.ts", root), "utf8");

for (const table of ["serial_generation_batches", "serial_number_history", "product_revisions", "work_locations", "profile_work_locations", "tracking_status_definitions", "serial_tracking_events"]) {
  assert.match(migration, new RegExp(`create table public\\.${table}\\b`), `Missing ${table}`);
}
assert.match(migration, /foreach t in array array\['serial_generation_batches','serial_number_history','product_revisions','work_locations','profile_work_locations','tracking_status_definitions','serial_tracking_events'\]/);
for (const table of ["serial_generation_batches", "serial_number_history", "product_revisions", "work_locations", "profile_work_locations", "tracking_status_definitions", "serial_tracking_events"]) {
  assert.match(migration, new RegExp(`create policy [^\\n]+ on public\\.${table}\\b`), `Missing read policy for ${table}`);
}
for (const fn of ["next_sen_serial", "generate_serial_batch", "regenerate_sen_serial", "update_manufacturer_serial", "admin_adjust_serialized_inventory", "admin_transfer_serialized_inventory", "capture_serial_event"]) {
  assert.match(migration, new RegExp(`function public\\.${fn}\\b`), `Missing ${fn}`);
}
assert.match(migration, /'SEN-'\|\|public\.normalize_serial_component\(brand_name\)\|\|'-'\|\|public\.normalize_serial_component\(model\)/);
assert.match(migration, /to_char\(timezone\('Asia\/Dhaka',now\(\)\),'DD-MM-YYYY'\)/);
assert.match(migration, /public\.secure_random_digits\(10\)/);
assert.match(migration, /serial_numbers_manufacturer_normalized_idx/);
assert.match(migration, /where previous_sen_serial is not null and event_type='regenerated'/);
assert.match(productActions, /sanitizeProductHtml/);
assert.match(productActions, /model_number/);
assert.match(productActions, /media_purpose/);
assert.match(productActions, /visibility/);
assert.match(inventoryActions, /admin_adjust_serialized_inventory/);
assert.match(inventoryActions, /admin_transfer_serialized_inventory/);
assert.match(sanitizer, /allowedTags/);
assert.doesNotMatch(sanitizer, /script/);
assert.match(labels, /code128/);
assert.match(labels, /SEN:1:/);
assert.match(navigation, /label:"Work Locations"/);
assert.match(navigation, /label:"Tracking Statuses"/);

const routes = [
  "app/admin/products/[id]/serials/new/page.tsx", "app/admin/serials/[id]/page.tsx", "app/admin/serials/print/page.tsx",
  "app/admin/serials/scan/page.tsx", "app/admin/serials/export/route.ts", "app/api/admin/serial-search/route.ts",
  "app/admin/work-locations/page.tsx", "app/admin/tracking-statuses/page.tsx", "app/employee/profile/page.tsx",
];
await Promise.all(routes.map((route) => access(new URL(route, root))));
console.log(`Inventory modernization Phase 1 static verification passed: 7 tables, 7 RPCs and ${routes.length} route entry points.`);
