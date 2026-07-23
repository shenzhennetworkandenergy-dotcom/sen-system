import { receiveExpectedSerialBatchAction } from "@/app/admin/serials/actions";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function SerialBatchesPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; product?: string }> }) {
  const { profile, permissions } = await requirePermission("serials.view");
  const message = await searchParams;
  const db = createSupabaseAdminClient();
  let batchQuery = db
    .from("serial_generation_batches")
    .select("id,product_id,quantity,status,condition,generated_at,products(name,sku),warehouses:expected_warehouse_id(name,code)")
    .order("generated_at", { ascending: false })
    .limit(100);
  if (message.product) batchQuery = batchQuery.eq("product_id", message.product);
  const [{ data: batches, error }, { data: selectedProduct }] = await Promise.all([
    batchQuery,
    message.product ? db.from("products").select("id,name,sku").eq("id", message.product).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Serial generation batches" subtitle="Generated labels are expected units until you receive their batch into stock.">
    {message.success ? <p className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 font-semibold text-emerald-900">{message.success}</p> : null}
    {message.error ? <p className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 font-semibold text-red-900">{message.error}</p> : null}
    {error ? <p className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 font-semibold text-red-900">Unable to load serial generation batches.</p> : null}
    {selectedProduct ? <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950"><div><span className="text-xs font-bold uppercase tracking-wider">Receiving stock for</span><strong className="block">{selectedProduct.name}</strong><span className="text-sm">{selectedProduct.sku}</span></div><div className="flex gap-2"><a href={`/admin/serials?product=${selectedProduct.id}`} className="rounded border border-blue-300 bg-white px-3 py-2 font-semibold">View serials</a><a href={`/admin/products/${selectedProduct.id}`} className="rounded border border-blue-300 bg-white px-3 py-2 font-semibold">Product details</a></div></div> : null}
    {batches?.length ? <div className="overflow-x-auto rounded-xl border bg-[var(--surface)]">
      <table className="w-full min-w-[860px] text-left">
        <thead><tr><th className="p-3">Generated</th><th>Product</th><th>Quantity</th><th>Warehouse</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{batches.map((batch) => <tr key={batch.id} className="border-t">
          <td className="p-3">{new Date(batch.generated_at).toLocaleString()}</td>
          <td>{(batch.products as unknown as { name: string } | null)?.name}</td>
          <td>{batch.quantity}</td>
          <td>{(batch.warehouses as unknown as { name: string } | null)?.name ?? "Expected"}</td>
          <td><span className={batch.status === "received" ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-900" : "rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900"}>{batch.status}</span></td>
          <td><div className="flex flex-wrap items-center gap-2">
            {batch.status === "generated" || batch.status === "partially_received" ? <form action={receiveExpectedSerialBatchAction}><input type="hidden" name="batch_id" value={batch.id}/><input type="hidden" name="return_product" value={batch.product_id}/><button className="rounded bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white">Receive into stock</button></form> : null}
            <a href={`/admin/serials/print?batch=${batch.id}`} className="font-semibold">Print</a>
            <a href={`/admin/serials/export?batch=${batch.id}`}>CSV</a>
          </div></td>
        </tr>)}</tbody>
      </table>
    </div> : !error ? <p className="rounded-xl border bg-[var(--surface)] p-8">No serial batches match this product.</p> : null}
  </DashboardShell>;
}
