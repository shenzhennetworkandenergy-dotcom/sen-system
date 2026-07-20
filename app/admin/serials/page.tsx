import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function SerialsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; warehouse?: string; page?: string }> }) {
  await connection();
  const { profile, permissions } = await requirePermission("serials.view");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1), size = 30;
  const db = createSupabaseAdminClient();
  let query = db.from("serial_numbers").select("id,manufacturer_serial,sen_serial,barcode_value,product_id,variation_id,warehouse_id,status,condition,created_at", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * size, page * size - 1);
  if (params.q?.trim()) query = query.or(`manufacturer_serial.ilike.%${params.q.trim()}%,sen_serial.ilike.%${params.q.trim()}%,barcode_value.ilike.%${params.q.trim()}%`);
  if (params.status) query = query.eq("status", params.status);
  if (params.warehouse) query = query.eq("warehouse_id", params.warehouse);
  const [{ data: serials, count, error }, { data: warehouses }] = await Promise.all([query, db.from("warehouses").select("id,code,name").eq("is_active", true).order("name")]);
  if (error) throw new Error("Unable to load serial numbers.");
  const productIds = [...new Set((serials ?? []).map((item) => item.product_id))];
  const { data: products } = productIds.length ? await db.from("products").select("id,name,sku").in("id", productIds) : { data: [] };
  const productMap = new Map((products ?? []).map((item) => [item.id, item]));
  const warehouseMap = new Map((warehouses ?? []).map((item) => [item.id, item]));
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Serial Tracking" subtitle="Trace serialized SEN stock by product, warehouse, status, and movement history.">
    <div className="mb-5 flex flex-wrap gap-3"><a href="/admin/inventory/adjustments/new" className="rounded bg-[var(--primary)] px-4 py-3 font-semibold text-[var(--primary-foreground)]">Register serialized stock</a></div>
    <form className="mb-5 grid gap-3 rounded-xl border bg-[var(--surface)] p-4 sm:grid-cols-2 lg:grid-cols-4"><input name="q" aria-label="Search serials" placeholder="Serial or barcode" defaultValue={params.q} className="rounded border p-2" /><select name="status" defaultValue={params.status} className="rounded border p-2"><option value="">All statuses</option>{["available", "reserved", "sold", "damaged", "unavailable", "transferred", "removed"].map((status) => <option key={status}>{status}</option>)}</select><select name="warehouse" defaultValue={params.warehouse} className="rounded border p-2"><option value="">All warehouses</option>{(warehouses ?? []).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>)}</select><button className="rounded border px-4 py-2 font-semibold">Apply filters</button></form>
    {serials?.length ? <div className="overflow-x-auto rounded-xl border bg-[var(--surface)]"><table className="w-full min-w-[950px] text-left text-sm"><thead><tr><th className="p-3">Manufacturer serial</th><th>SEN serial</th><th>Product</th><th>Warehouse</th><th>Status</th><th>Condition</th><th>Registered</th></tr></thead><tbody>{serials.map((serial) => { const product = productMap.get(serial.product_id), warehouse = warehouseMap.get(serial.warehouse_id); return <tr key={serial.id} className="border-t"><td className="p-3"><a className="font-semibold" href={`/admin/serials/${serial.id}`}>{serial.manufacturer_serial}</a></td><td>{serial.sen_serial ?? "-"}</td><td>{product?.name ?? serial.product_id}<span className="block text-xs text-[var(--muted-text)]">{product?.sku}</span></td><td>{warehouse ? `${warehouse.name} (${warehouse.code})` : serial.warehouse_id}</td><td>{serial.status}</td><td>{serial.condition}</td><td>{new Date(serial.created_at).toLocaleDateString()}</td></tr>; })}</tbody></table></div> : <p className="rounded-xl border bg-[var(--surface)] p-8 text-center text-[var(--muted-text)]">No serial numbers match these filters. Register serials while adding serialized stock.</p>}
    <p className="mt-4 text-sm">Page {page} - {count ?? 0} total serial numbers</p>
  </DashboardShell>;
}
