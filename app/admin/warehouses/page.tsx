import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createWarehouseAction } from "../inventory/actions";

export default async function WarehousesPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const { profile, permissions } = await requirePermission("warehouses.view");
  const messages = await searchParams;
  const db = createSupabaseAdminClient();
  const { data: warehouses, error } = await db.from("warehouses").select("id,code,name,country_code,country_name,address,is_active,created_at").order("name");
  if (error) throw new Error("Unable to load warehouses.");
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Warehouses" subtitle="Manage SEN stock facilities and their internal locations.">
    {messages.success ? <p className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-green-900">{messages.success}</p> : null}
    {messages.error ? <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-900">{messages.error}</p> : null}
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="overflow-x-auto rounded-xl border bg-[var(--surface)]">
        <table className="w-full min-w-[650px] text-left text-sm"><thead><tr><th className="p-3">Code</th><th>Name</th><th>Country</th><th>Status</th><th>Created</th></tr></thead><tbody>{(warehouses ?? []).map((warehouse) => <tr key={warehouse.id} className="border-t"><td className="p-3"><a className="font-semibold" href={`/admin/warehouses/${warehouse.id}`}>{warehouse.code}</a></td><td>{warehouse.name}</td><td>{warehouse.country_name} ({warehouse.country_code})</td><td>{warehouse.is_active ? "Active" : "Inactive"}</td><td>{new Date(warehouse.created_at).toLocaleDateString()}</td></tr>)}</tbody></table>
        {!warehouses?.length ? <p className="p-8 text-center text-[var(--muted-text)]">No warehouses exist yet.</p> : null}
      </div>
      <form action={createWarehouseAction} className="h-fit space-y-4 rounded-xl border bg-[var(--surface)] p-6">
        <h2 className="text-xl font-semibold">Add warehouse</h2>
        <label className="block text-sm font-medium">Code<input required name="code" maxLength={30} className="mt-1 w-full rounded border p-2" /></label>
        <label className="block text-sm font-medium">Name<input required name="name" maxLength={120} className="mt-1 w-full rounded border p-2" /></label>
        <div className="grid grid-cols-[100px_1fr] gap-3"><label className="block text-sm font-medium">ISO code<input required name="country_code" minLength={2} maxLength={2} placeholder="CN" className="mt-1 w-full rounded border p-2 uppercase" /></label><label className="block text-sm font-medium">Country<input required name="country_name" maxLength={100} className="mt-1 w-full rounded border p-2" /></label></div>
        <label className="block text-sm font-medium">Address<textarea name="address" maxLength={500} rows={3} className="mt-1 w-full rounded border p-2" /></label>
        <button className="rounded bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]">Create warehouse</button>
      </form>
    </section>
  </DashboardShell>;
}
