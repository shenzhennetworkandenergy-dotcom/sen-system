import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { confirmOwnWorkplaceAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function EmployeeProfilePage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const { profile } = await requireProfile(["employee"]);
  const db = createSupabaseAdminClient();
  const [permissions, message, locationsResult, assignmentResult, warehouseResult] = await Promise.all([
    getEffectivePermissions(profile.id), searchParams,
    db.from("work_locations").select("id,name,code,location_type,city,country_code").eq("is_active", true).order("name"),
    db.from("profile_work_locations").select("work_location_id,work_locations(name,code,city,country_code)").eq("profile_id", profile.id).eq("is_primary", true).eq("is_active", true).maybeSingle(),
    db.from("profile_warehouse_assignments").select("warehouse_id,warehouses(name,code,address,country_name)").eq("profile_id", profile.id).eq("is_primary", true).eq("is_active", true).maybeSingle(),
  ]);
  const current = assignmentResult.data?.work_locations as unknown as { name:string; code:string; city:string|null; country_code:string } | null;
  const warehouse = warehouseResult.data?.warehouses as unknown as { name:string; code:string; address:string|null; country_name:string|null } | null;
  return <DashboardShell title="My workplace" subtitle="Your approved workplace and primary warehouse assignments." employeePermissions={permissions}>
    {message.success ? <p className="mb-4 rounded border border-green-200 bg-green-50 p-3">{message.success}</p> : null}{message.error ? <p className="mb-4 rounded border border-red-200 bg-red-50 p-3">{message.error}</p> : null}
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Current primary workplace</h2><p className="mt-3">{current ? `${current.name} (${current.code}) · ${current.city ?? "—"}, ${current.country_code}` : "No verified workplace is assigned."}</p><form action={confirmOwnWorkplaceAction} className="mt-5 flex flex-col gap-3 sm:flex-row"><select name="work_location_id" required defaultValue={assignmentResult.data?.work_location_id ?? ""} className="min-h-12 flex-1 rounded border p-3"><option value="">Choose an approved location</option>{(locationsResult.data ?? []).map((item)=><option key={item.id} value={item.id}>{item.name} ({item.code}) · {item.city ?? "—"}, {item.country_code}</option>)}</select><button className="rounded border px-5 py-3 font-semibold">Confirm workplace</button></form></section>
      <section className="rounded-xl border border-cyan-200 bg-cyan-50 p-6 text-cyan-950"><h2 className="text-xl font-semibold">Assigned warehouse</h2><p className="mt-3 font-semibold">{warehouse ? `${warehouse.name} (${warehouse.code})` : "No warehouse assigned"}</p>{warehouse ? <p className="mt-1 text-sm">{[warehouse.address, warehouse.country_name].filter(Boolean).join(" · ") || "Address not recorded"}</p> : <p className="mt-1 text-sm">Ask an administrator to assign your primary warehouse.</p>}</section>
    </div>
  </DashboardShell>;
}
