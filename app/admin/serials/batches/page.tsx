import { receiveExpectedSerialBatchAction } from "@/app/admin/serials/actions";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function SerialBatchesPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const { profile, permissions } = await requirePermission("serials.view");
  const message = await searchParams;
  const { data: batches } = await createSupabaseAdminClient()
    .from("serial_generation_batches")
    .select("id,quantity,status,condition,generated_at,products(name,sku),warehouses:expected_warehouse_id(name,code)")
    .order("generated_at", { ascending: false })
    .limit(100);

  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Serial generation batches" subtitle="Generated labels are expected units until you receive their batch into stock.">
    {message.success ? <p className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 font-semibold text-emerald-900">{message.success}</p> : null}
    {message.error ? <p className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 font-semibold text-red-900">{message.error}</p> : null}
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
            {batch.status !== "received" ? <form action={receiveExpectedSerialBatchAction}><input type="hidden" name="batch_id" value={batch.id}/><button className="rounded bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white">Receive into stock</button></form> : null}
            <a href={`/admin/serials/print?batch=${batch.id}`} className="font-semibold">Print</a>
            <a href={`/admin/serials/export?batch=${batch.id}`}>CSV</a>
          </div></td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="rounded-xl border bg-[var(--surface)] p-8">No serial batches yet.</p>}
  </DashboardShell>;
}
