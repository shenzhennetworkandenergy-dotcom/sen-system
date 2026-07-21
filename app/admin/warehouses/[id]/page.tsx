import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createWarehouseLocationAction } from "../../inventory/actions";

export default async function WarehouseDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  const { profile, permissions } = await requirePermission("warehouses.view");
  const [{ id }, messages] = await Promise.all([params, searchParams]);
  const db = createSupabaseAdminClient();
  const [{ data: warehouse }, { data: locations }, { data: balances }] = await Promise.all([
    db.from("warehouses").select("*").eq("id", id).maybeSingle(), db.from("warehouse_locations").select("id,code,name,is_active,created_at").eq("warehouse_id", id).order("code"), db.from("inventory_balances").select("id,product_id,variation_id,on_hand,reserved,incoming,available,damaged,unavailable").eq("warehouse_id", id).order("updated_at", { ascending: false }).limit(500),
  ]);
  if (!warehouse) notFound();
  const productIds = [...new Set((balances ?? []).map((item) => item.product_id))];
  const { data: products } = productIds.length ? await db.from("products").select("id,name,sku").in("id", productIds) : { data: [] };
  const productMap = new Map((products ?? []).map((item) => [item.id, item]));
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title={`${warehouse.name} (${warehouse.code})`} subtitle={`${warehouse.country_name}${warehouse.address ? ` - ${warehouse.address}` : ""}`}>
    {messages.success ? <p className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-green-900">{messages.success}</p> : null}{messages.error ? <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-900">{messages.error}</p> : null}
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <article className="rounded-xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Locations</h2>{locations?.length ? <ul className="mt-4 grid gap-3 sm:grid-cols-2">{locations.map((location) => <li key={location.id} className="rounded border p-3"><b>{location.code}</b><span className="block">{location.name}</span><span className="text-sm text-[var(--muted-text)]">{location.is_active ? "Active" : "Inactive"}</span></li>)}</ul> : <p className="mt-3 text-[var(--muted-text)]">No internal locations have been created.</p>}</article>
      <form action={createWarehouseLocationAction.bind(null, id)} className="h-fit space-y-4 rounded-xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Add location</h2><label className="block text-sm font-medium">Code<input required name="code" maxLength={40} className="mt-1 w-full rounded border p-2" /></label><label className="block text-sm font-medium">Name<input required name="name" maxLength={120} className="mt-1 w-full rounded border p-2" /></label><button className="rounded bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]">Add location</button></form>
    </section>
    <section className="mt-6 overflow-x-auto rounded-xl border bg-[var(--surface)]"><h2 className="p-6 text-xl font-semibold">Stock balances</h2><table className="w-full min-w-[900px] text-left text-sm"><thead><tr><th className="p-3">Product</th><th>Variation</th><th>On hand</th><th>Reserved</th><th>Incoming</th><th>Available</th><th>Damaged</th><th>Unavailable</th></tr></thead><tbody>{(balances ?? []).map((balance) => { const product = productMap.get(balance.product_id); return <tr key={balance.id} className="border-t"><td className="p-3"><a className="font-semibold" href={`/admin/products/${balance.product_id}`}>{product?.name ?? balance.product_id}</a><span className="block text-xs text-[var(--muted-text)]">{product?.sku}</span></td><td>{balance.variation_id ?? "Parent"}</td><td>{balance.on_hand}</td><td>{balance.reserved}</td><td>{balance.incoming}</td><td>{balance.available}</td><td>{balance.damaged}</td><td>{balance.unavailable}</td></tr>; })}</tbody></table>{!balances?.length ? <p className="p-8 text-center text-[var(--muted-text)]">This warehouse has no stock balances yet.</p> : null}</section>
  </DashboardShell>;
}
