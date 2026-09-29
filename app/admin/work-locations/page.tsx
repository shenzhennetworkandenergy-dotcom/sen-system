import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assignWarehouseAction, assignWorkLocationAction, createWorkLocationAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function WorkLocationsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const { profile, permissions } = await requirePermission("locations.view");
  const db = createSupabaseAdminClient();
  const [message, locationsResult, employeesResult, workAssignmentsResult, warehousesResult, warehouseAssignmentsResult] = await Promise.all([
    searchParams,
    db.from("work_locations").select("id,name,code,location_type,city,country_code,is_active").order("name"),
    db.from("profiles").select("id,full_name,email").eq("role", "employee").eq("status", "active").order("full_name"),
    db.from("profile_work_locations").select("profile_id,work_location_id").eq("is_primary", true).eq("is_active", true),
    db.from("warehouses").select("id,name,code,country_name").eq("is_active", true).order("name"),
    db.from("profile_warehouse_assignments").select("profile_id,warehouse_id").eq("is_primary", true).eq("is_active", true),
  ]);
  const error = locationsResult.error ?? employeesResult.error ?? workAssignmentsResult.error ?? warehousesResult.error ?? warehouseAssignmentsResult.error;
  if (error) throw new Error("Unable to load employee location assignments.");
  const locations = locationsResult.data ?? [], employees = employeesResult.data ?? [], warehouses = warehousesResult.data ?? [];
  const workMap = new Map((workAssignmentsResult.data ?? []).map((item) => [item.profile_id, item.work_location_id]));
  const warehouseMap = new Map((warehouseAssignmentsResult.data ?? []).map((item) => [item.profile_id, item.warehouse_id]));

  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Work Locations" subtitle="Assign each employee to an approved workplace and primary warehouse.">
    {message.success ? <p className="mb-4 rounded border border-green-200 bg-green-50 p-3">{message.success}</p> : null}
    {message.error ? <p className="mb-4 rounded border border-red-200 bg-red-50 p-3">{message.error}</p> : null}
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Locations</h2><ul className="mt-4 divide-y">{locations.map((item) => <li key={item.id} className="py-3"><strong>{item.name}</strong><span className="block text-sm text-[var(--muted-text)]">{item.code} · {item.location_type.replaceAll("_", " ")} · {item.city ?? "—"}, {item.country_code}</span></li>)}</ul>
        {profile.role === "admin" ? <form action={createWorkLocationAction} className="mt-5 grid gap-3 sm:grid-cols-2"><input name="name" required placeholder="Location name" className="rounded border p-3"/><input name="code" required placeholder="Code" className="rounded border p-3"/><select name="location_type" className="rounded border p-3">{["office","warehouse","supplier","freight_forwarder","airport","seaport","customs","temporary_site","other"].map((value)=><option key={value}>{value}</option>)}</select><input name="country_code" required maxLength={2} defaultValue="BD" className="rounded border p-3"/><input name="city" placeholder="City" className="rounded border p-3"/><input name="timezone" defaultValue="Asia/Dhaka" className="rounded border p-3"/><textarea name="address_line" placeholder="Address" className="rounded border p-3 sm:col-span-2"/><button className="rounded border px-4 py-3 font-semibold sm:col-span-2">Create location</button></form> : null}
      </section>
      {profile.role === "admin" ? <section className="space-y-5">
        <form action={assignWorkLocationAction} className="rounded-xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Employee primary workplace</h2><div className="mt-4 space-y-3"><select name="profile_id" required className="w-full rounded border p-3"><option value="">Choose employee</option>{employees.map((employee)=><option key={employee.id} value={employee.id}>{employee.full_name ?? employee.email}{workMap.has(employee.id) ? " · assigned" : ""}</option>)}</select><select name="work_location_id" required className="w-full rounded border p-3"><option value="">Choose active location</option>{locations.filter((item)=>item.is_active).map((item)=><option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</select><button className="rounded bg-[var(--primary)] px-4 py-3 font-semibold text-[var(--primary-foreground)]">Assign workplace</button></div></form>
        <form action={assignWarehouseAction} className="rounded-xl border border-cyan-200 bg-cyan-50 p-6"><h2 className="text-xl font-semibold text-cyan-950">Employee primary warehouse</h2><div className="mt-4 space-y-3"><select name="profile_id" required className="w-full rounded border bg-white p-3"><option value="">Choose employee</option>{employees.map((employee)=><option key={employee.id} value={employee.id}>{employee.full_name ?? employee.email}{warehouseMap.has(employee.id) ? " · assigned" : ""}</option>)}</select><select name="warehouse_id" required className="w-full rounded border bg-white p-3"><option value="">Choose warehouse</option>{warehouses.map((warehouse)=><option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code}) · {warehouse.country_name}</option>)}</select><button className="rounded bg-cyan-800 px-4 py-3 font-semibold text-white">Assign warehouse</button></div></form>
      </section> : null}
    </div>
  </DashboardShell>;
}
