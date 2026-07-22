import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "supabase/migrations/202607220002_inventory_orders_tracking_phase_2.sql",
  "supabase/tests/phase2_orders_tracking.sql",
  "app/admin/orders/page.tsx", "app/admin/orders/new/page.tsx", "app/admin/orders/[id]/page.tsx",
  "app/admin/orders/[id]/allocate/page.tsx", "app/admin/orders/[id]/pack/page.tsx", "app/admin/orders/[id]/shipments/new/page.tsx",
  "app/admin/shipments/page.tsx", "app/admin/shipments/[id]/page.tsx", "app/account/orders/page.tsx", "app/account/orders/[id]/page.tsx",
  "app/account/addresses/page.tsx", "components/orders/AnimatedShipmentMap.tsx", "components/orders/ShipmentTrackingCard.tsx",
];
for (const file of required) if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing Phase 2 file: ${file}`);
const migration = fs.readFileSync(path.join(root, required[0]), "utf8"), nav = fs.readFileSync(path.join(root, "lib/navigation/dashboard.ts"), "utf8"), packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const table of ["customer_addresses","sales_orders","sales_order_items","order_serial_allocations","order_packages","shipments","shipment_items","shipment_tracking_events","shipment_route_points","shipment_documents"]) if (!migration.includes(`public.${table}`)) throw new Error(`Migration is missing ${table}`);
for (const rpc of ["create_sales_order","confirm_sales_order","allocate_order_serials","auto_allocate_order_serials","save_order_packing","create_order_shipment","dispatch_order_shipment","add_shipment_tracking_event","mark_shipment_delivered"]) if (!migration.includes(`function public.${rpc}`)) throw new Error(`Migration is missing ${rpc}`);
for (const rule of ["enable row level security","service_role","customer_order_restricted","order_serial_one_active_assignment_idx"]) if (!migration.includes(rule)) throw new Error(`Migration security check missing: ${rule}`);
if (!nav.includes("routes.adminOrders") || !nav.includes("routes.adminShipments")) throw new Error("Implemented navigation entries are missing.");
if (!packageJson.scripts?.["test:inventory-phase2"]) throw new Error("Phase 2 package script is missing.");
for (const source of ["components/orders/AnimatedShipmentMap.tsx","components/orders/ShipmentTrackingCard.tsx"]) { const content = fs.readFileSync(path.join(root, source), "utf8"); if (!/Estimated route|Estimated logistics map|not live GPS/i.test(content)) throw new Error(`${source} lacks truthful tracking language.`); }
console.log(`Phase 2 static verification passed (${required.length} required files, schema/RPC/RLS/navigation/truthfulness checks).`);
